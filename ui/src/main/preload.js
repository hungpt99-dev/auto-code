'use strict';

/**
 * Preload script — runs in the renderer context but with Node access.
 * contextBridge restricts what the renderer can call, preventing
 * arbitrary Node/Electron API exposure (security boundary).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: () =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (settings) =>
    ipcRenderer.invoke('settings:save', settings),

  // ── Jira ───────────────────────────────────────────────────────────────────
  fetchJiraIssues: (params) =>
    ipcRenderer.invoke('jira:fetchIssues', params),

  fetchJiraIssue: (params) =>
    ipcRenderer.invoke('jira:fetchIssue', params),

  sendJiraComment: (params) =>
    ipcRenderer.invoke('jira:sendComment', params),

  // ── File system ────────────────────────────────────────────────────────────
  saveZip: (params) =>
    ipcRenderer.invoke('files:saveZip', params),

  savePatch: (params) =>
    ipcRenderer.invoke('files:savePatch', params),

  // ── Folder picker dialog ───────────────────────────────────────────────────
  selectFolder: () =>
    ipcRenderer.invoke('dialog:selectFolder'),

  // ── Git (local only — push to remote is blocked) ──────────────────────────
  gitRun: (params) =>
    ipcRenderer.invoke('git:run', params),

  // ── AI quick-ask (direct call, bypasses n8n) ──────────────────────────────
  aiQuickAsk: (params) =>
    ipcRenderer.invoke('ai:quickAsk', params),

  // ── CLI tools (gh copilot, etc.) ────────────────────────────────────────
  cliRun: (params) =>
    ipcRenderer.invoke('cli:run', params),
  // ── Repo file-tree scanner (multi-repo context for code gen) ───────────
  repoScanTree: (params) =>
    ipcRenderer.invoke('repo:scanTree', params),

  // ── Repo language detector (counts source file extensions) ──────────────
  repoDetectLanguage: (params) =>
    ipcRenderer.invoke('repo:detectLanguage', params),
});
