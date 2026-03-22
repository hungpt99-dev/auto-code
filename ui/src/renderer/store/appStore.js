/**
 * Zustand store — dashboard stats, workflows, history, UI state.
 * Persisted to localStorage via zustand/middleware persist.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Default workflows ────────────────────────────────────────────────────────
const DEFAULT_WORKFLOWS = [
  {
    id: 'wf-code',
    taskType: 'code',
    name: 'Code Generation',
    description: 'Full feature implementation from a Jira issue',
    active: true,
    webhookUrl: '',
    steps: [
      { id: 'wf-code-s1', order: 0, label: 'Fetch Jira details',    prompt: 'Fetch the complete Jira issue including acceptance criteria, description, and linked issues.', editable: false },
      { id: 'wf-code-s2', order: 1, label: 'Analyze requirements', prompt: 'Analyze the requirements and identify affected files, modules, and components in the repository.', editable: true },
      { id: 'wf-code-s3', order: 2, label: 'Plan architecture',    prompt: 'Plan the implementation: list files to create/modify, define function signatures, and identify dependencies.', editable: true },
      { id: 'wf-code-s4', order: 3, label: 'Generate code',        prompt: 'Generate clean, production-ready code following SOLID principles and the project coding style.', editable: true },
      { id: 'wf-code-s5', order: 4, label: 'Write tests',          prompt: 'Write comprehensive unit and integration tests with edge cases and mocks.', editable: true },
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
      { id: 'wf-bug-s1', order: 0, label: 'Reproduce issue',   prompt: 'Analyze the bug description and identify reproduction steps and environment.', editable: false },
      { id: 'wf-bug-s2', order: 1, label: 'Trace root cause',  prompt: 'Scan the codebase to find root cause. Look at stack traces, error logs, and affected components.', editable: true },
      { id: 'wf-bug-s3', order: 2, label: 'Generate fix',      prompt: 'Generate a minimal, targeted fix that resolves the root cause without side effects.', editable: true },
      { id: 'wf-bug-s4', order: 3, label: 'Regression tests',  prompt: 'Write regression tests to prevent this bug from recurring.', editable: true },
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
      { id: 'wf-review-s1', order: 0, label: 'Fetch context',     prompt: 'Fetch the code changes and related Jira issue context.', editable: false },
      { id: 'wf-review-s2', order: 1, label: 'Security audit',    prompt: 'Audit for OWASP Top 10 vulnerabilities, injection risks, and authentication issues.', editable: true },
      { id: 'wf-review-s3', order: 2, label: 'Code quality',      prompt: 'Review for SOLID principles, code smells, cyclomatic complexity, and maintainability.', editable: true },
      { id: 'wf-review-s4', order: 3, label: 'Performance',       prompt: 'Identify N+1 queries, memory leaks, inefficient algorithms, and bottlenecks.', editable: true },
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
      { id: 'wf-test-s1', order: 0, label: 'Analyze coverage gaps', prompt: 'Analyze the current test coverage and identify gaps.', editable: false },
      { id: 'wf-test-s2', order: 1, label: 'Unit tests',            prompt: 'Generate comprehensive unit tests for all public functions and classes.', editable: true },
      { id: 'wf-test-s3', order: 2, label: 'Integration tests',     prompt: 'Generate integration tests covering API endpoints, database interactions, and service boundaries.', editable: true },
      { id: 'wf-test-s4', order: 3, label: 'Edge cases',            prompt: 'Add tests for boundary conditions, null inputs, large payloads, and error paths.', editable: true },
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
    }),
    {
      name: 'auto-code-app-store',
      partialize: (state) => ({
        workflows:      state.workflows,
        history:        state.history,
        dashboardStats: state.dashboardStats,
        workFolder:     state.workFolder,
      }),
    }
  )
);
