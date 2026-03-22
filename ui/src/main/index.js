'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const Store = require('electron-store');
const axios = require('axios');
const { runGit } = require('./git');
const { runCli } = require('./cli');

// ─── Secure local settings store ─────────────────────────────────────────────
const store = new Store({
  name: 'auto-code',
  defaults: {
    settings: {
      jiraUrl: '',
      jiraEmail: '',
      jiraToken: '',
      openaiKey: '',
      claudeKey: '',
      geminiKey: '',
      aiProvider: 'openai',
      aiModel: '',
      n8nUrl: 'http://localhost:5678',
      repoPath: '',
      repos: [],
      workflowConfig: {},
    },
  },
});

let mainWindow;

// ─── Window factory ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#0f0f1a',
    show: false,
    title: 'Auto Code',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // renderer cannot access Node APIs directly
      nodeIntegration: false,   // security: keep Node out of the renderer
      sandbox: false,           // required for preload scripts using contextBridge
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  localServer = startLocalServer();
});

app.on('window-all-closed', () => {
  // On macOS apps stay open until Cmd+Q; on Windows/Linux quit immediately.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC: Settings ────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => store.get('settings'));

ipcMain.handle('settings:save', (_event, settings) => {
  const allowedStr = ['jiraUrl', 'jiraEmail', 'jiraToken', 'openaiKey', 'claudeKey', 'geminiKey', 'n8nUrl', 'repoPath', 'aiProvider', 'aiModel'];
  const TASK_IDS = ['code', 'explain', 'bug', 'review', 'test', 'docs', 'refactor'];
  const safe = {};
  for (const [k, v] of Object.entries(settings)) {
    if (k === 'repos' && Array.isArray(v)) {
      // Validate each repo entry
      safe.repos = v
        .filter((r) => r && typeof r.path === 'string' && r.path.trim())
        .map((r) => ({
          id:   String(r.id   || Date.now()).slice(0, 50),
          name: String(r.name || 'Repo').slice(0, 100),
          path: String(r.path).slice(0, 500),
        }));
    } else if (k === 'workflowConfig' && v && typeof v === 'object' && !Array.isArray(v)) {
      // Per-task-type webhook URL overrides — only allow known task IDs
      const wc = {};
      for (const tid of TASK_IDS) {
        if (typeof v[tid] === 'string') wc[tid] = v[tid].slice(0, 500);
      }
      safe.workflowConfig = wc;
    } else if (allowedStr.includes(k)) {
      safe[k] = v;
    }
  }
  store.set('settings', safe);
  return { success: true };
});

// ─── IPC: Jira — fetch issue list ────────────────────────────────────────────
ipcMain.handle('jira:fetchIssues', async (_event, { jiraUrl, jiraEmail, jiraToken, jql, maxResults = 50 }) => {
  try {
    // Migrated from deprecated GET /rest/api/3/search to POST /rest/api/3/search/jql
    const { data } = await axios.post(
      `${jiraUrl}/rest/api/3/search/jql`,
      {
        jql: jql || 'assignee = currentUser() ORDER BY updated DESC',
        maxResults,
        fields: ['summary', 'status', 'issuetype', 'assignee', 'priority', 'updated'],
      },
      {
        auth: { username: jiraEmail, password: jiraToken },
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    return { success: true, data };
  } catch (err) {
    const message = err.response?.data?.errorMessages?.[0] || err.response?.data?.message || err.message;
    return { success: false, error: message };
  }
});

// ─── IPC: Jira — fetch single issue ──────────────────────────────────────────
ipcMain.handle('jira:fetchIssue', async (_event, { jiraUrl, jiraEmail, jiraToken, issueKey }) => {
  try {
    const { data } = await axios.get(`${jiraUrl}/rest/api/3/issue/${issueKey}`, {
      params: {
        fields: 'summary,description,status,issuetype,assignee,reporter,priority,comment',
      },
      auth: { username: jiraEmail, password: jiraToken },
      headers: { Accept: 'application/json' },
      timeout: 15000,
    });
    return { success: true, data };
  } catch (err) {
    const message = err.response?.data?.errorMessages?.[0] || err.message;
    return { success: false, error: message };
  }
});

// ─── IPC: Jira — post comment ────────────────────────────────────────────────
ipcMain.handle('jira:sendComment', async (_event, { jiraUrl, jiraEmail, jiraToken, issueKey, comment }) => {
  try {
    await axios.post(
      `${jiraUrl}/rest/api/3/issue/${issueKey}/comment`,
      {
        // Jira Cloud requires Atlassian Document Format (ADF)
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: comment }],
            },
          ],
        },
      },
      {
        auth: { username: jiraEmail, password: jiraToken },
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    return { success: true };
  } catch (err) {
    const message = err.response?.data?.errorMessages?.[0] || err.message;
    return { success: false, error: message };
  }
});

// ─── IPC: Files — save ZIP ───────────────────────────────────────────────────
ipcMain.handle('files:saveZip', async (_event, { zipBuffer, defaultName }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'generated-code.zip',
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (canceled || !filePath) return { success: false, cancelled: true };

  fs.writeFileSync(filePath, Buffer.from(zipBuffer));
  return { success: true, filePath };
});

// ─── IPC: Files — save PATCH ─────────────────────────────────────────────────
ipcMain.handle('files:savePatch', async (_event, { content, defaultName }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'changes.diff',
    filters: [{ name: 'Patch / Diff File', extensions: ['diff', 'patch'] }],
  });

  if (canceled || !filePath) return { success: false, cancelled: true };

  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, filePath };
});

// ─── IPC: Files — select folder (repo picker) ────────────────────────────────
ipcMain.handle('dialog:selectFolder', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Local Repository Folder',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths.length) return { success: false, cancelled: true };
  return { success: true, folderPath: filePaths[0] };
});

// ─── IPC: Repo — detect dominant language from file extensions ───────────────
ipcMain.handle('repo:detectLanguage', (_event, { paths }) => {
  const EXT_TO_LANG = {
    js: 'javascript', jsx: 'javascript', cjs: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    java: 'java',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    kt: 'kotlin', kts: 'kotlin',
    swift: 'swift',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'cpp', h: 'cpp', hpp: 'cpp',
  };
  const IGNORE = new Set([
    'node_modules', '.git', 'dist', 'build', 'target', 'out',
    '__pycache__', 'vendor', '.gradle', 'coverage', 'venv', '.venv',
  ]);

  function countExtensions(dir, depth, counts) {
    if (depth < 0) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        countExtensions(path.join(dir, e.name), depth - 1, counts);
      } else {
        const ext = e.name.split('.').pop()?.toLowerCase();
        if (ext && EXT_TO_LANG[ext]) {
          counts[EXT_TO_LANG[ext]] = (counts[EXT_TO_LANG[ext]] || 0) + 1;
        }
      }
    }
  }

  const totals = {};
  for (const repoPath of (Array.isArray(paths) ? paths : [])) {
    if (!repoPath || !fs.existsSync(repoPath)) continue;
    countExtensions(repoPath, 4, totals);
  }

  if (!Object.keys(totals).length) return { language: null };
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return { language: top[0], counts: totals };
});

// ─── IPC: Repo — scan file tree of one or more local repos ─────────────────
ipcMain.handle('repo:scanTree', (_event, { paths }) => {
  const IGNORE = new Set([
    'node_modules', '.git', 'dist', 'build', 'target', 'out', '.next',
    '__pycache__', 'vendor', '.gradle', 'coverage', '.nyc_output', '.cache',
    'venv', '.venv', 'env', '.env', 'bin', 'obj',
  ]);

  function buildTree(dir, depth, prefix) {
    if (depth < 0) return '';
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return ''; }
    entries = entries
      .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 50);
    return entries.map((e, i) => {
      const last = i === entries.length - 1;
      const line = prefix + (last ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ') + e.name + (e.isDirectory() ? '/' : '');
      if (e.isDirectory() && depth > 0) {
        const sub = buildTree(path.join(dir, e.name), depth - 1, prefix + (last ? '    ' : '\u2502   '));
        return sub ? line + '\n' + sub : line;
      }
      return line;
    }).join('\n');
  }

  const result = {};
  for (const repoPath of (Array.isArray(paths) ? paths : [])) {
    if (!repoPath || !fs.existsSync(repoPath)) { result[repoPath] = '(path not found)'; continue; }
    result[repoPath] = buildTree(repoPath, 3, '') || '(empty)';
  }
  return result;
});

// ─── IPC: Git — run local git command ────────────────────────────────────────
ipcMain.handle('git:run', async (_event, { repoPath, args }) => {
  try {
    const result = await runGit(repoPath, args);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: AI — direct quick-ask (bypasses n8n, calls provider API directly) ──
ipcMain.handle('ai:quickAsk', async (_event, { question, provider, model, openaiKey, claudeKey, geminiKey }) => {
  try {
    let answer;

    if (provider === 'openai' || !provider) {
      const { data } = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: model || 'gpt-4o',
          temperature: 0.3,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: 'You are a helpful senior software engineer assistant. Be concise and practical.' },
            { role: 'user',   content: question },
          ],
        },
        { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      answer = data.choices[0].message.content;

    } else if (provider === 'claude') {
      const { data } = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 2048,
          messages: [{ role: 'user', content: question }],
        },
        {
          headers: {
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );
      answer = data.content[0].text;

    } else if (provider === 'gemini') {
      const mdl = model || 'gemini-1.5-flash';
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${geminiKey}`,
        { contents: [{ parts: [{ text: question }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } },
        { timeout: 60000 }
      );
      answer = data.candidates[0].content.parts[0].text;

    } else {
      return { success: false, error: `Unknown provider: ${provider}` };
    }

    return { success: true, answer };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return { success: false, error: msg };
  }
});

// ─── IPC: CLI — run allowed CLI tools (gh copilot, etc.) ─────────────────────
ipcMain.handle('cli:run', async (_event, { tool, args }) => {
  try {
    const result = await runCli(tool, Array.isArray(args) ? args : []);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Work Folder — scan a directory for git repositories ────────────────
ipcMain.handle('workfolder:scan', async (_event, { folderPath }) => {
  const normalized = path.normalize(folderPath);
  if (!fs.existsSync(normalized)) return { success: false, error: 'Folder not found' };

  let entries;
  try {
    entries = fs.readdirSync(normalized, { withFileTypes: true });
  } catch (e) {
    return { success: false, error: e.message };
  }

  const repos = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const repoPath = path.join(normalized, entry.name);
    const gitDir   = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) continue;

    // Read current branch from .git/HEAD (works for normal + bare repos)
    let branch = 'unknown';
    try {
      const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
      if (head.startsWith('ref: refs/heads/')) {
        branch = head.replace('ref: refs/heads/', '');
      } else if (/^[0-9a-f]{40}$/i.test(head)) {
        branch = head.slice(0, 7); // detached HEAD — show short SHA
      }
    } catch { /* leave branch as 'unknown' */ }

    repos.push({ name: entry.name, path: repoPath, branch });
  }

  return { success: true, repos };
});

// ─── IPC: Work Folder — read categorised source files for AI context ──────────
ipcMain.handle('workfolder:readContext', async (_event, { repoPath, maxChars = 20000 }) => {
  const normalized = path.normalize(repoPath);
  if (!fs.existsSync(normalized)) return { success: false, error: 'Repo path not found' };

  // Path-based heuristics to bucket files into AI context categories
  const CATEGORY_PATTERNS = {
    controllers: [/controller/i, /handler/i, /router/i, /resource/i, /endpoint/i, /routes?\.[jt]sx?$/i],
    services:    [/service/i,    /usecase/i,  /use.case/i, /business/i, /manager/i, /facade/i],
    entities:    [/entity/i,     /model/i,    /domain/i,   /schema/i,   /dto/i,     /types?\.[jt]sx?$/i],
    configs:     [/config/i, /configuration/i, /properties/i,
                  /application\.(yml|yaml|properties|json)$/i, /setup\.[jt]sx?$/i],
  };

  const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'target', 'out', '.next',
    '__pycache__', 'vendor', '.gradle', 'coverage', '.nyc_output', '.cache',
    'venv', '.venv', 'env', 'bin', 'obj', 'generated', '.idea', '.vscode',
  ]);

  const SOURCE_EXTS = new Set([
    'java', 'kt', 'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs',
    'cs', 'php', 'rb', 'cpp', 'c', 'h', 'xml', 'yml', 'yaml',
    'json', 'properties',
  ]);

  const perCategoryMax = Math.floor(maxChars / 4);
  const context = { controllers: '', services: '', entities: '', configs: '' };

  function scanDir(dir, depth) {
    if (depth < 0) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), depth - 1);
        continue;
      }

      const ext = entry.name.split('.').pop()?.toLowerCase();
      if (!SOURCE_EXTS.has(ext)) continue;

      const filePath = path.join(dir, entry.name);
      const relPath  = path.relative(normalized, filePath);

      // Find which category this file belongs to (first match wins)
      let category = null;
      for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        if (patterns.some((p) => p.test(relPath))) { category = cat; break; }
      }
      if (!category) continue;
      if (context[category].length >= perCategoryMax) continue;

      try {
        const raw = fs.readFileSync(filePath, 'utf8').slice(0, 3000);
        context[category] += `\n// === ${relPath} ===\n${raw}\n`;
      } catch { /* skip unreadable files */ }
    }
  }

  scanDir(normalized, 6);

  return {
    success: true,
    context: {
      controllers: context.controllers.slice(0, perCategoryMax),
      services:    context.services.slice(0, perCategoryMax),
      entities:    context.entities.slice(0, perCategoryMax),
      configs:     context.configs.slice(0, perCategoryMax),
    },
    totalChars: Object.values(context).reduce((s, v) => s + v.length, 0),
  };
});

// ─── IPC: Work Folder — apply a patch file to a local git repo ───────────────
ipcMain.handle('workfolder:applyPatch', async (_event, { repoPath, patchContent }) => {
  const normalized = path.normalize(repoPath);
  if (!fs.existsSync(normalized)) return { success: false, error: 'Repo path not found' };
  if (!patchContent || typeof patchContent !== 'string' || !patchContent.trim()) {
    return { success: false, error: 'No patch content provided' };
  }

  const os      = require('os');
  const tmpFile = path.join(os.tmpdir(), `auto-code-${Date.now()}.diff`);

  try {
    fs.writeFileSync(tmpFile, patchContent, 'utf8');

    // Dry-run first — fail fast before touching working tree
    try {
      await runGit(normalized, ['apply', '--check', tmpFile]);
    } catch (checkErr) {
      return {
        success: false,
        error:   'Patch does not apply cleanly.',
        details: checkErr.message || checkErr.stderr || '',
      };
    }

    const result = await runGit(normalized, ['apply', tmpFile]);
    return { success: true, output: result.stdout || 'Patch applied successfully.' };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup error */ }
  }
});

// ─── IPC: Workflow — execute a workflow definition via n8n ────────────────────
// Creates a job, fires the n8n webhook, and returns the jobId immediately.
// n8n will POST step updates back to our local HTTP callback server.
ipcMain.handle('workflow:execute', async (_event, { jobId, issueKey, workflowDef, repo, settings }) => {
  if (!jobId || !issueKey || !workflowDef) {
    return { success: false, error: 'jobId, issueKey, and workflowDef are required' };
  }

  const callbackPort = localServer ? localServer.address()?.port : 3847;
  const n8nBase = (settings?.n8nUrl || 'http://localhost:5678').replace(/\/$/, '');
  const webhookUrl = `${n8nBase}/webhook/execute-workflow`;

  try {
    // Fire-and-forget — n8n runs async and posts callbacks; we don't await completion
    axios.post(
      webhookUrl,
      {
        jobId,
        issueKey,
        workflow: workflowDef,
        repo: repo || {},
        settings: {
          jiraUrl:    settings?.jiraUrl || '',
          jiraEmail:  settings?.jiraEmail || '',
          jiraToken:  settings?.jiraToken || '',
          provider:   settings?.aiProvider || 'openai',
          model:      settings?.aiModel || null,
          openaiKey:  settings?.openaiKey || '',
          claudeKey:  settings?.claudeKey || '',
          geminiKey:  settings?.geminiKey || '',
        },
        callbackUrl: `http://localhost:${callbackPort}/api/job-update`,
      },
      { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    ).catch((err) => {
      // Notify renderer that n8n trigger failed
      sendToRenderer('job:update', {
        jobId,
        stepId: null,
        status: 'FAILED',
        message: `Failed to reach n8n: ${err.message}`,
      });
    });

    return { success: true, jobId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Job status — poll current job state from renderer ──────────────────
ipcMain.handle('job:getStatus', (_event, { jobId }) => {
  const job = jobStore.get(jobId);
  return job || null;
});

// ─── Local HTTP server for n8n → app callbacks ───────────────────────────────
// n8n POSTs step-level updates here during workflow execution.
// The server is bound to localhost only — it never listens on external interfaces.

// In-memory job store (authoritative source; mirrored to renderer via IPC events)
const jobStore = new Map();

/**
 * Send an IPC event to the renderer window.
 * Safe to call before the window is ready (events will be dropped).
 * @param {string} channel
 * @param {*} data
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

let localServer = null;

function startLocalServer() {
  const server = http.createServer((req, res) => {
    // CORS — allow only localhost origins
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://localhost');

    // ── POST /api/job-update ─ n8n sends step progress here ─────────────────
    if (req.method === 'POST' && url.pathname === '/api/job-update') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const update = JSON.parse(body);
          const { jobId, stepId, status, message } = update;

          if (!jobId || !status) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'jobId and status are required' }));
            return;
          }

          // Upsert in-memory store
          const job = jobStore.get(jobId) || { jobId, status: 'PROCESSING', steps: {}, createdAt: new Date().toISOString() };
          if (stepId) {
            const now = new Date().toISOString();
            const prev = job.steps[stepId] || {};
            job.steps[stepId] = {
              stepId,
              status,
              message: message || '',
              startedAt: status === 'running' ? now : (prev.startedAt || null),
              endedAt:   (status === 'done' || status === 'failed') ? now : (prev.endedAt || null),
            };
          }
          if (status === 'DONE')   { job.status = 'DONE';   job.completedAt = new Date().toISOString(); }
          if (status === 'FAILED') { job.status = 'FAILED'; job.error = message || ''; job.completedAt = new Date().toISOString(); }
          jobStore.set(jobId, job);

          // Forward update to renderer via IPC
          sendToRenderer('job:update', { jobId, stepId, status, message });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    // ── GET /api/job-status/:jobId ─ polling fallback ────────────────────────
    const jobMatch = url.pathname.match(/^\/api\/job-status\/([^/]+)$/);
    if (req.method === 'GET' && jobMatch) {
      const job = jobStore.get(jobMatch[1]);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(job));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(3847, '127.0.0.1', () => {
    console.log('[auto-code] Local callback server listening on http://127.0.0.1:3847');
  });

  server.on('error', (err) => {
    console.error('[auto-code] Local server error:', err.message);
  });

  return server;
}
