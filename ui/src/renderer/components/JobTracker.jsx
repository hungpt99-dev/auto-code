/**
 * JobTracker.jsx
 *
 * Real-time workflow execution progress panel.
 * Listens for `job:update` IPC events and renders step-level status.
 *
 * Can be used:
 *  - Inline in TaskDrawer (current job for this issue)
 *  - As a global panel showing all active jobs
 */

import { useEffect, useMemo } from 'react';
import { useAppStore, STEP_TYPE_MAP } from '../store/appStore';
import { subscribeToJobUpdates } from '../services/workflowExecution.service';

const STATUS_ICON = {
  pending:    { icon: '⬡', cls: 'step-pending'    },
  running:    { icon: '⟳', cls: 'step-running'    },
  done:       { icon: '✓', cls: 'step-done'        },
  failed:     { icon: '✗', cls: 'step-failed'      },
  PROCESSING: { icon: '⟳', cls: 'step-running'    },
  DONE:       { icon: '✓', cls: 'step-done'        },
  FAILED:     { icon: '✗', cls: 'step-failed'      },
  PENDING:    { icon: '⬡', cls: 'step-pending'     },
};

function elapsed(startedAt, endedAt) {
  if (!startedAt) return '';
  const from = new Date(startedAt);
  const to   = endedAt ? new Date(endedAt) : new Date();
  const ms   = to - from;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Single step row ──────────────────────────────────────────────────────────
function StepRow({ stepDef, stepState, index }) {
  const meta   = STEP_TYPE_MAP[stepDef?.type] || {};
  const state  = stepState || { status: 'pending', message: '' };
  const si     = STATUS_ICON[state.status] || STATUS_ICON.pending;
  const dur    = elapsed(state.startedAt, state.endedAt);

  return (
    <div className={`jt-step-row jt-step-row--${si.cls}`}>
      <div className="jt-step-index">{index + 1}</div>
      <div className="jt-step-type-dot" style={{ background: meta.color || '#6b7280' }} />
      <div className="jt-step-body">
        <div className="jt-step-name">
          {meta.icon && <span style={{ marginRight: 4 }}>{meta.icon}</span>}
          {stepDef?.label || `Step ${index + 1}`}
        </div>
        {state.message && (
          <div className="jt-step-message">{state.message}</div>
        )}
      </div>
      <div className="jt-step-right">
        {dur && <span className="jt-step-elapsed">{dur}</span>}
        <span className={`jt-step-status-icon ${si.cls}`}>{si.icon}</span>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ steps, stepStates }) {
  const total = steps.length;
  const done  = steps.filter((s) => {
    const st = stepStates[s.id];
    return st?.status === 'done';
  }).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="jt-progress-bar-wrap">
      <div className="jt-progress-bar" style={{ width: `${pct}%` }} />
      <span className="jt-progress-label">{pct}%</span>
    </div>
  );
}

// ─── JobTracker (single job) ──────────────────────────────────────────────────
export function JobTracker({ jobId, workflowDef }) {
  const { jobs, updateJobStep, completeJob } = useAppStore();
  const job = jobs[jobId];

  // Subscribe to real-time updates for this job
  useEffect(() => {
    const unsub = subscribeToJobUpdates((update) => {
      if (update.jobId !== jobId) return;

      const { stepId, status, message } = update;

      if ((status === 'DONE' || status === 'FAILED') && !stepId) {
        // Top-level job completion
        completeJob(jobId, status, message || '');
      } else if (stepId) {
        updateJobStep(jobId, stepId, status, message);
        // If job-level status comes too
        if (status === 'DONE' || status === 'FAILED') {
          completeJob(jobId, status, message || '');
        }
      }
    });
    return unsub;
  }, [jobId, updateJobStep, completeJob]);

  if (!job || !workflowDef) return null;

  const steps      = workflowDef.steps || [];
  const stepStates = job.steps || {};
  const jobSI      = STATUS_ICON[job.status] || STATUS_ICON.PENDING;

  return (
    <div className={`job-tracker jt-status--${job.status?.toLowerCase()}`}>
      <div className="jt-header">
        <div className="jt-title">
          <span className={`jt-status-badge jt-status-badge--${job.status?.toLowerCase()}`}>
            {jobSI.icon} {job.status}
          </span>
          <span className="jt-issue-key">{job.issueKey}</span>
        </div>
        {job.status === 'PROCESSING' && (
          <span className="jt-spinner" aria-label="Running" />
        )}
      </div>

      {steps.length > 0 && (
        <ProgressBar steps={steps} stepStates={stepStates} />
      )}

      <div className="jt-steps-list">
        {steps.map((stepDef, i) => (
          <StepRow
            key={stepDef.id}
            stepDef={stepDef}
            stepState={stepStates[stepDef.id]}
            index={i}
          />
        ))}
      </div>

      {job.error && (
        <div className="jt-error-box">
          <span className="jt-error-icon">⚠</span>
          {job.error}
        </div>
      )}
    </div>
  );
}

// ─── JobTrackerPanel — shows all recent/active jobs ──────────────────────────
export function JobTrackerPanel() {
  const { jobs, workflows, updateJobStep, completeJob } = useAppStore();

  // Subscribe globally — updates any job in the store
  useEffect(() => {
    const unsub = subscribeToJobUpdates(({ jobId, stepId, status, message }) => {
      if ((status === 'DONE' || status === 'FAILED') && !stepId) {
        completeJob(jobId, status, message || '');
      } else if (stepId) {
        updateJobStep(jobId, stepId, status, message);
      }
    });
    return unsub;
  }, [updateJobStep, completeJob]);

  const recentJobs = useMemo(
    () =>
      Object.values(jobs)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10),
    [jobs]
  );

  if (recentJobs.length === 0) {
    return (
      <div className="jt-panel-empty">
        <div className="empty-icon">🔄</div>
        <p>No workflow executions yet. Trigger a workflow from a Kanban card to see progress here.</p>
      </div>
    );
  }

  return (
    <div className="jt-panel">
      {recentJobs.map((job) => {
        const wf = workflows.find((w) => w.id === job.workflowId);
        return (
          <div key={job.jobId} className="jt-panel-item">
            <div className="jt-panel-item-header">
              <span className={`jt-status-badge jt-status-badge--${job.status?.toLowerCase()}`}>
                {STATUS_ICON[job.status]?.icon} {job.status}
              </span>
              <span className="jt-panel-issue">{job.issueKey}</span>
              <span className="jt-panel-wf-name">{wf?.name || job.workflowId}</span>
              <span className="jt-panel-time">
                {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="jt-panel-steps">
              {(wf?.steps || []).map((stepDef, i) => {
                const st = job.steps?.[stepDef.id];
                const si = STATUS_ICON[st?.status || 'pending'] || STATUS_ICON.pending;
                const meta = STEP_TYPE_MAP[stepDef.type] || {};
                return (
                  <div key={stepDef.id} className={`jt-mini-step ${si.cls}`} title={`${stepDef.label}: ${st?.status || 'pending'}`}>
                    <span className="jt-mini-step-icon">{si.icon}</span>
                    <span className="jt-mini-step-label">{meta.icon} {stepDef.label}</span>
                  </div>
                );
              })}
            </div>

            {job.error && (
              <div className="jt-error-box jt-error-box--compact">{job.error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default JobTracker;
