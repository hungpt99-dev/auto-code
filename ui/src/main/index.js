'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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
      n8nUrl: 'http://localhost:5678',
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
app.whenReady().then(createWindow);

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
  // Validate that we only persist expected keys (prevent prototype pollution)
  const allowed = ['jiraUrl', 'jiraEmail', 'jiraToken', 'openaiKey', 'claudeKey', 'geminiKey', 'n8nUrl', 'repoPath', 'aiProvider', 'aiModel'];
  const safe = Object.fromEntries(
    Object.entries(settings).filter(([k]) => allowed.includes(k))
  );
  store.set('settings', safe);
  return { success: true };
});

// ─── IPC: Jira — fetch issue list ────────────────────────────────────────────
ipcMain.handle('jira:fetchIssues', async (_event, { jiraUrl, jiraEmail, jiraToken, jql, maxResults = 50 }) => {
  try {
    const { data } = await axios.get(`${jiraUrl}/rest/api/3/search`, {
      params: {
        jql: jql || 'assignee = currentUser() ORDER BY updated DESC',
        maxResults,
        fields: 'summary,status,issuetype,assignee,priority,updated',
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
