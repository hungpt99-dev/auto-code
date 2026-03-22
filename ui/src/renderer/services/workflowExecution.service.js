/**
 * workflowExecution.service.js
 *
 * Bridges the UI → Electron main process → n8n workflow execution pipeline.
 * Responsibilities:
 *  - Generate unique job IDs
 *  - Call the `workflow:execute` IPC handler
 *  - Subscribe to real-time `job:update` events from main
 *  - Expose a simple promise-based trigger API to components
 */

import { useAppStore } from '../store/appStore';

/**
 * Generate a time-based unique job ID.
 * @returns {string}
 */
export function generateJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Execute a workflow definition via n8n.
 *
 * Flow:
 *  1. Create a job entry in Zustand (so the UI can show pending state immediately)
 *  2. Call Electron IPC `workflow:execute` — fires n8n webhook (fire-and-forget)
 *  3. n8n POSTs step updates to the local callback server
 *  4. Main process forwards updates via IPC → `onJobUpdate` listeners in the renderer
 *
 * @param {object} params
 * @param {string} params.issueKey     Jira issue key (e.g. "PROJ-123")
 * @param {object} params.workflowDef  Workflow definition (id, name, steps[])
 * @param {object} [params.repo]       Repo object { name, path, branch }
 * @param {object} params.settings     Redux settings slice
 * @returns {Promise<{success: boolean, jobId?: string, error?: string}>}
 */
export async function executeWorkflow({ issueKey, workflowDef, repo, settings }) {
  if (!window.electronAPI?.executeWorkflow) {
    return { success: false, error: 'electronAPI.executeWorkflow not available' };
  }

  const { createJob } = useAppStore.getState();
  const jobId = generateJobId();

  // Pre-create job in UI state (shows immediately in job tracker)
  createJob(jobId, issueKey, workflowDef.id, workflowDef.steps || []);

  try {
    const result = await window.electronAPI.executeWorkflow({
      jobId,
      issueKey,
      workflowDef,
      repo: repo || null,
      settings,
    });
    return result;
  } catch (err) {
    return { success: false, error: err.message, jobId };
  }
}

/**
 * Subscribe to real-time job update events.
 * The callback is called for ALL job updates — subscribers should filter by jobId.
 *
 * @param {(update: {jobId, stepId, status, message}) => void} callback
 * @returns {() => void}  Unsubscribe function
 */
export function subscribeToJobUpdates(callback) {
  if (!window.electronAPI?.onJobUpdate) return () => {};
  return window.electronAPI.onJobUpdate(callback);
}
