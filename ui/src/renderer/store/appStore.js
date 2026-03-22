/**
 * Zustand store — dashboard stats, workflows, history, UI state.
 * Persisted to localStorage via zustand/middleware persist.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Step types ───────────────────────────────────────────────────────────────
// These map 1-to-1 with n8n execution nodes in execute-workflow.workflow.json
export const STEP_TYPES = [
  { id: 'AI_ANALYZE',   label: 'AI Analyze',    icon: '🔍', color: '#6366f1', description: 'Send requirements to AI for analysis' },
  { id: 'AI_GENERATE',  label: 'AI Generate',   icon: '⚡', color: '#8b5cf6', description: 'Generate code or content with AI' },
  { id: 'APPLY_PATCH',  label: 'Apply Patch',   icon: '📋', color: '#f59e0b', description: 'Apply generated patch to the repo' },
  { id: 'GIT_COMMIT',   label: 'Git Commit',    icon: '💾', color: '#10b981', description: 'Commit changes to the local repository' },
  { id: 'GIT_STATUS',   label: 'Git Status',    icon: '📊', color: '#06b6d4', description: 'Check git status of the repository' },
  { id: 'FETCH_JIRA',   label: 'Fetch Jira',    icon: '🎫', color: '#0ea5e9', description: 'Fetch issue details from Jira' },
  { id: 'CUSTOM',       label: 'Custom HTTP',   icon: '🌐', color: '#ec4899', description: 'Call a custom HTTP endpoint' },
];

export const STEP_TYPE_MAP = Object.fromEntries(STEP_TYPES.map((t) => [t.id, t]));

// ─── Default workflows ────────────────────────────────────────────────────────
const DEFAULT_WORKFLOWS = [
  {
    id: 'wf-code',
    taskType: 'code',
    name: 'Feature Implementation',
    description: 'Full feature implementation from a Jira issue',
    active: true,
    webhookUrl: '',
    steps: [
      { id: 'wf-code-s1', order: 0, type: 'FETCH_JIRA',  label: 'Fetch Jira details',    config: {}, editable: false },
      { id: 'wf-code-s2', order: 1, type: 'AI_ANALYZE',  label: 'Analyze requirements',  config: { promptTemplate: 'Analyze the requirements and identify affected files, modules, and components.' }, editable: true },
      { id: 'wf-code-s3', order: 2, type: 'AI_GENERATE', label: 'Generate code',          config: { promptTemplate: 'Generate clean, production-ready code following SOLID principles.', maxTokens: 8192 }, editable: true },
      { id: 'wf-code-s4', order: 3, type: 'APPLY_PATCH', label: 'Apply patch',            config: {}, editable: true },
      { id: 'wf-code-s5', order: 4, type: 'GIT_COMMIT',  label: 'Commit changes',         config: { message: 'feat: {{issueKey}} - {{summary}}' }, editable: true },
    ],
  },
  {
    id: 'wf-bug',
    taskType: 'bug',
    name: 'Bug Fix',
    description: 'Root cause analysis and minimal fix generation',
    active: true,
    webhookUrl: '',
    steps: [
      { id: 'wf-bug-s1', order: 0, type: 'FETCH_JIRA',  label: 'Fetch issue',      config: {}, editable: false },
      { id: 'wf-bug-s2', order: 1, type: 'AI_ANALYZE',  label: 'Trace root cause', config: { promptTemplate: 'Analyze the bug and trace its root cause using the codebase context.' }, editable: true },
      { id: 'wf-bug-s3', order: 2, type: 'AI_GENERATE', label: 'Generate fix',     config: { promptTemplate: 'Generate a minimal, targeted fix that resolves the root cause.', maxTokens: 4096 }, editable: true },
      { id: 'wf-bug-s4', order: 3, type: 'APPLY_PATCH', label: 'Apply fix',        config: {}, editable: true },
    ],
  },
  {
    id: 'wf-review',
    taskType: 'review',
    name: 'Code Review',
    description: 'Security, performance, and code quality review',
    active: true,
    webhookUrl: '',
    steps: [
      { id: 'wf-review-s1', order: 0, type: 'FETCH_JIRA',  label: 'Fetch context',  config: {}, editable: false },
      { id: 'wf-review-s2', order: 1, type: 'AI_ANALYZE',  label: 'Security audit', config: { promptTemplate: 'Audit for OWASP Top 10 vulnerabilities, injection risks, and authentication issues.' }, editable: true },
      { id: 'wf-review-s3', order: 2, type: 'AI_GENERATE', label: 'Review report',  config: { promptTemplate: 'Generate a comprehensive code review report with findings and recommendations.', maxTokens: 4096 }, editable: true },
    ],
  },
  {
    id: 'wf-test',
    taskType: 'test',
    name: 'Test Generation',
    description: 'Unit, integration, and edge case tests',
    active: true,
    webhookUrl: '',
    steps: [
      { id: 'wf-test-s1', order: 0, type: 'FETCH_JIRA',  label: 'Fetch issue',        config: {}, editable: false },
      { id: 'wf-test-s2', order: 1, type: 'AI_ANALYZE',  label: 'Analyze gaps',       config: { promptTemplate: 'Analyze the current test coverage and identify gaps.' }, editable: true },
      { id: 'wf-test-s3', order: 2, type: 'AI_GENERATE', label: 'Generate tests',     config: { promptTemplate: 'Generate comprehensive unit and integration tests.', maxTokens: 8192 }, editable: true },
      { id: 'wf-test-s4', order: 3, type: 'APPLY_PATCH', label: 'Apply test files',   config: {}, editable: true },
    ],
  },
];

// ─── Build default 7-day AI usage chart data ─────────────────────────────────
function buildUsageChart() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toLocaleDateString('en', { weekday: 'short' }), count: 0 };
  });
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useAppStore = create(
  persist(
    (set, get) => ({
      // ── Dashboard stats ──────────────────────────────────────────────────────
      dashboardStats: {
        aiGenerationsToday: 0,
        successCount: 0,
        failedCount: 0,
        avgGenTimeSec: 0,
        aiUsageLast7Days: buildUsageChart(),
      },

      /**
       * Record an AI generation result into the dashboard stats.
       * @param {{ success: boolean, durationSec: number }} param
       */
      recordGeneration: ({ success, durationSec = 0 }) => {
        set((s) => {
          const today = new Date().toLocaleDateString('en', { weekday: 'short' });
          const stats = s.dashboardStats;
          const newSuccess = stats.successCount + (success ? 1 : 0);
          const newFailed  = stats.failedCount  + (success ? 0 : 1);
          const newAvg = success && durationSec > 0
            ? ((stats.avgGenTimeSec * stats.successCount) + durationSec) / (newSuccess || 1)
            : stats.avgGenTimeSec;
          const usage = stats.aiUsageLast7Days.map((d) =>
            d.date === today ? { ...d, count: d.count + 1 } : d
          );
          return {
            dashboardStats: {
              ...stats,
              aiGenerationsToday: stats.aiGenerationsToday + 1,
              successCount: newSuccess,
              failedCount: newFailed,
              avgGenTimeSec: Math.round(newAvg * 10) / 10,
              aiUsageLast7Days: usage,
            },
          };
        });
      },

      // ── Workflows ─────────────────────────────────────────────────────────────
      workflows: DEFAULT_WORKFLOWS,

      addWorkflow: (wf) =>
        set((s) => ({ workflows: [...s.workflows, wf] })),

      updateWorkflow: (id, changes) =>
        set((s) => ({
          workflows: s.workflows.map((wf) => (wf.id === id ? { ...wf, ...changes } : wf)),
        })),

      deleteWorkflow: (id) =>
        set((s) => ({ workflows: s.workflows.filter((wf) => wf.id !== id) })),

      addStep: (workflowId, step) =>
        set((s) => ({
          workflows: s.workflows.map((wf) =>
            wf.id === workflowId ? { ...wf, steps: [...wf.steps, step] } : wf
          ),
        })),

      updateStep: (workflowId, stepId, changes) =>
        set((s) => ({
          workflows: s.workflows.map((wf) =>
            wf.id === workflowId
              ? { ...wf, steps: wf.steps.map((st) => (st.id === stepId ? { ...st, ...changes } : st)) }
              : wf
          ),
        })),

      deleteStep: (workflowId, stepId) =>
        set((s) => ({
          workflows: s.workflows.map((wf) =>
            wf.id === workflowId
              ? { ...wf, steps: wf.steps.filter((st) => st.id !== stepId) }
              : wf
          ),
        })),

      moveStep: (workflowId, stepId, direction) =>
        set((s) => ({
          workflows: s.workflows.map((wf) => {
            if (wf.id !== workflowId) return wf;
            const steps = [...wf.steps];
            const idx = steps.findIndex((st) => st.id === stepId);
            const next = direction === 'up' ? idx - 1 : idx + 1;
            if (next < 0 || next >= steps.length) return wf;
            [steps[idx], steps[next]] = [steps[next], steps[idx]];
            return { ...wf, steps };
          }),
        })),

      // ── History ───────────────────────────────────────────────────────────────
      history: [],

      /**
       * Add a history entry (cap at 200 items).
       * @param {{ id, issueKey, taskType, language, summary, files, patch, success, timestamp }} entry
       */
      addHistoryEntry: (entry) =>
        set((s) => ({ history: [entry, ...s.history].slice(0, 200) })),

      deleteHistoryEntry: (id) =>
        set((s) => ({ history: s.history.filter((h) => h.id !== id) })),

      clearHistory: () => set({ history: [] }),

      // ── Work Folder ───────────────────────────────────────────────────────────
      // A Work Folder is a local directory containing multiple git repositories.
      // It is persisted so the user doesn't need to re-scan on every launch.
      workFolder: { path: null, repos: [] },

      /**
       * Set the active work folder and its detected repos.
       * @param {string} folderPath  Absolute path to the work folder
       * @param {Array<{name:string,path:string,branch:string}>} repos Detected git repos
       */
      setWorkFolder: (folderPath, repos) =>
        set(() => ({ workFolder: { path: folderPath, repos: Array.isArray(repos) ? repos : [] } })),

      /** Clear the work folder (user clicked × or selected a new one). */
      clearWorkFolder: () =>
        set(() => ({ workFolder: { path: null, repos: [] } })),

      // ── Job Tracking ─────────────────────────────────────────────────────────
      // jobs is a map: { [jobId]: JobState }
      // JobState: { jobId, issueKey, workflowId, status, steps: { [stepId]: StepState }, createdAt, error }
      // StepState: { stepId, status: 'pending'|'running'|'done'|'failed', message, startedAt, endedAt }
      jobs: {},

      /**
       * Create a new job entry when workflow execution starts.
       * @param {string} jobId
       * @param {string} issueKey
       * @param {string} workflowId
       * @param {Array<{id: string}>} steps
       */
      createJob: (jobId, issueKey, workflowId, steps) =>
        set((s) => ({
          jobs: {
            ...s.jobs,
            [jobId]: {
              jobId,
              issueKey,
              workflowId,
              status: 'PENDING',
              steps: Object.fromEntries(
                steps.map((st) => [st.id, { stepId: st.id, status: 'pending', message: '', startedAt: null, endedAt: null }])
              ),
              createdAt: new Date().toISOString(),
              error: null,
            },
          },
        })),

      /**
       * Upsert a step status update for a running job. Called when n8n POSTs a callback.
       * @param {string} jobId
       * @param {string} stepId
       * @param {'pending'|'running'|'done'|'failed'} status
       * @param {string} [message]
       */
      updateJobStep: (jobId, stepId, status, message = '') =>
        set((s) => {
          const job = s.jobs[jobId];
          if (!job) return {};
          const now = new Date().toISOString();
          const prevStep = job.steps[stepId] || {};
          return {
            jobs: {
              ...s.jobs,
              [jobId]: {
                ...job,
                status: status === 'failed' ? 'FAILED' : 'PROCESSING',
                steps: {
                  ...job.steps,
                  [stepId]: {
                    ...prevStep,
                    stepId,
                    status,
                    message,
                    startedAt: status === 'running' ? now : (prevStep.startedAt ?? null),
                    endedAt:   (status === 'done' || status === 'failed') ? now : (prevStep.endedAt ?? null),
                  },
                },
              },
            },
          };
        }),

      /**
       * Mark a job as fully completed (DONE or FAILED).
       * @param {string} jobId
       * @param {'DONE'|'FAILED'} status
       * @param {string} [error]
       */
      completeJob: (jobId, status, error = '') =>
        set((s) => {
          const job = s.jobs[jobId];
          if (!job) return {};
          return {
            jobs: {
              ...s.jobs,
              [jobId]: { ...job, status, error: error || null, completedAt: new Date().toISOString() },
            },
          };
        }),

      /** Remove jobs older than 24 hours to prevent unbounded storage growth. */
      pruneOldJobs: () =>
        set((s) => {
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          const pruned = Object.fromEntries(
            Object.entries(s.jobs).filter(([, job]) => new Date(job.createdAt).getTime() > cutoff)
          );
          return { jobs: pruned };
        }),
    }),
    {
      name: 'auto-code-app-store',
      partialize: (state) => ({
        workflows:      state.workflows,
        history:        state.history,
        dashboardStats: state.dashboardStats,
        workFolder:     state.workFolder,
        jobs:           state.jobs,
      }),
    }
  )
);
