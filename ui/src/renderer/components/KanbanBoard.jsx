import { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchIssues, clearError } from '../store/issuesSlice';
import { useAppStore } from '../store/appStore';
import TaskDrawer from './TaskDrawer';
import Loader from './Loader';
import { JobTrackerPanel } from './JobTracker';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_ORDER = [
  'To Do', 'Open', 'Backlog',
  'In Progress', 'In Development',
  'In Review', 'Code Review', 'PR Open',
  'QA', 'Testing', 'UAT',
  'Blocked',
  'Done', 'Closed', 'Resolved',
];

const STATUS_COLOR = {
  'To Do':          '#6b7280',
  'Open':           '#6b7280',
  'Backlog':        '#475569',
  'In Progress':    '#3b82f6',
  'In Development': '#3b82f6',
  'In Review':      '#f59e0b',
  'Code Review':    '#f59e0b',
  'PR Open':        '#f59e0b',
  'QA':             '#06b6d4',
  'Testing':        '#06b6d4',
  'UAT':            '#8b5cf6',
  'Blocked':        '#ef4444',
  'Done':           '#10b981',
  'Closed':         '#10b981',
  'Resolved':       '#10b981',
};

const PRIORITY_ICON = {
  Highest: { icon: '🔴', label: 'Highest' },
  High:    { icon: '🟠', label: 'High'    },
  Medium:  { icon: '🟡', label: 'Medium'  },
  Low:     { icon: '🟢', label: 'Low'     },
  Lowest:  { icon: '⚪', label: 'Lowest'  },
};

const TYPE_ICON = {
  Bug:          '🐛',
  Story:        '📖',
  Task:         '✅',
  Epic:         '⚡',
  'Sub-task':   '↳',
  Feature:      '✨',
  Improvement:  '📈',
};

// Sort columns: STATUS_ORDER first, then other statuses alphabetically
function sortColNames(keys) {
  return [...keys].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a);
    const bi = STATUS_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ issue, onClick, onDragStart, onDragEnd, activeJob }) {
  const priority = issue.fields.priority?.name;
  const type     = issue.fields.issuetype?.name;
  const assignee = issue.fields.assignee?.displayName;
  const updated  = issue.fields.updated
    ? new Date(issue.fields.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  const initials = assignee
    ? assignee.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : null;

  const isWorking = activeJob && (activeJob.status === 'PROCESSING' || activeJob.status === 'PENDING');
  const isFailed  = activeJob && activeJob.status === 'FAILED';
  const isDone    = activeJob && activeJob.status === 'DONE';

  let runningStepMsg = '';
  if (isWorking && activeJob.steps) {
    const runningStep = Object.values(activeJob.steps).find((s) => s.status === 'running');
    if (runningStep) runningStepMsg = runningStep.message || '';
  }

  return (
    <div
      className={`kcard${isWorking ? ' kcard--working' : ''}${isFailed ? ' kcard--failed' : ''}${isDone ? ' kcard--done-wf' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {isWorking && (
        <div className="kcard-working-bar">
          <span className="kcard-working-spinner" />
          <span className="kcard-working-label">{runningStepMsg || 'AI Working…'}</span>
        </div>
      )}
      {isFailed && (
        <div className="kcard-failed-bar">✗ Workflow failed</div>
      )}

      <div className="kcard-top">
        <span className="kcard-key">{issue.key}</span>
        {type && (
          <span className="kcard-type-badge" title={type}>
            {TYPE_ICON[type] ?? '📌'}
          </span>
        )}
      </div>

      <div className="kcard-summary">{issue.fields.summary}</div>

      <div className="kcard-footer">
        {priority && PRIORITY_ICON[priority] && (
          <span className="kcard-priority" title={priority}>
            {PRIORITY_ICON[priority].icon}
          </span>
        )}
        {updated && <span className="kcard-date">{updated}</span>}
        {initials && (
          <span className="kcard-avatar" title={assignee}>{initials}</span>
        )}
        {isDone && <span className="kcard-wf-done-badge">✓ Done</span>}
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ name, issues, color, onCardClick, onDrop, dragOverCol, onDragEnter, onDragLeave, activeJobByIssue }) {
  const isOver = dragOverCol === name;

  return (
    <div
      className={`kanban-col${isOver ? ' kanban-col--over' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => onDragEnter(name)}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(name)}
    >
      <div className="kanban-col-header">
        <span className="kanban-col-dot" style={{ background: color }} />
        <span className="kanban-col-name">{name}</span>
        <span className="kanban-col-count">{issues.length}</span>
      </div>

      <div className="kanban-col-body">
        {issues.map((issue) => (
          <KanbanCard
            key={issue.id}
            issue={issue}
            activeJob={activeJobByIssue[issue.key]}
            onClick={() => onCardClick(issue)}
            onDragStart={(e) => {
              e.dataTransfer.setData('issueId', issue.id);
              e.dataTransfer.setData('fromCol', name);
            }}
            onDragEnd={() => {}}
          />
        ))}
        {issues.length === 0 && (
          <div className="kanban-col-empty">Drop here</div>
        )}
      </div>
    </div>
  );
}

// ─── KanbanBoard ──────────────────────────────────────────────────────────────

export default function KanbanBoard() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const { list: issues, listLoading, error } = useSelector((s) => s.issues);
  const settings  = useSelector((s) => s.settings);
  const { jobs, pruneOldJobs }   = useAppStore();

  // Build a lookup: issueKey → most recent active/latest job
  const activeJobByIssue = Object.values(jobs).reduce((acc, job) => {
    const existing = acc[job.issueKey];
    if (!existing || new Date(job.createdAt) > new Date(existing.createdAt)) {
      acc[job.issueKey] = job;
    }
    return acc;
  }, {});

  const [showJobPanel, setShowJobPanel] = useState(false);
  const activeJobCount = Object.values(jobs).filter((j) => j.status === 'PROCESSING' || j.status === 'PENDING').length;

  const [jql, setJql]               = useState('assignee = currentUser() ORDER BY updated DESC');
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerIssue, setDrawerIssue] = useState(null);
  const [columns, setColumns]       = useState({});   // { statusName: issue[] }
  const [dragOverCol, setDragOverCol] = useState(null);
  const dragEnterCount = useRef(0);                   // fix nested-drag-enter flicker

  // Auto-fetch when settings ready
  useEffect(() => {
    if (settings.loaded && settings.jiraUrl && settings.jiraToken) {
      handleFetch();
    }
  }, [settings.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild columns whenever the issue list changes
  useEffect(() => {
    const grouped = {};
    issues.forEach((issue) => {
      const col = issue.fields.status.name;
      if (!grouped[col]) grouped[col] = [];
      grouped[col].push(issue);
    });
    setColumns(grouped);
  }, [issues]);

  function handleFetch() {
    dispatch(fetchIssues({
      jiraUrl:   settings.jiraUrl,
      jiraEmail: settings.jiraEmail,
      jiraToken: settings.jiraToken,
      jql,
    }));
  }

  // Visual-only drag: move card between columns locally (no Jira API call)
  const handleDrop = useCallback((targetCol) => {
    setDragOverCol(null);
    dragEnterCount.current = 0;
  }, []);

  const handleDragEnter = useCallback((col) => {
    dragEnterCount.current += 1;
    setDragOverCol(col);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragEnterCount.current -= 1;
    if (dragEnterCount.current <= 0) {
      dragEnterCount.current = 0;
      setDragOverCol(null);
    }
  }, []);

  // Filter issues by search term
  const filteredColumns = searchTerm.trim()
    ? Object.fromEntries(
        Object.entries(columns).map(([col, iss]) => [
          col,
          iss.filter((i) =>
            i.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.fields.summary.toLowerCase().includes(searchTerm.toLowerCase())
          ),
        ])
      )
    : columns;

  const colNames  = sortColNames(Object.keys(filteredColumns));
  const totalCount = issues.length;

  // ── Not configured ──
  if (settings.loaded && !settings.jiraUrl) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚙️</div>
        <h2>No Jira configuration</h2>
        <p>Add your Jira credentials in Settings to get started.</p>
        <button className="btn btn-primary" onClick={() => navigate('/settings')}>
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="kanban-page">
      {/* ── Toolbar ── */}
      <div className="kanban-toolbar">
        <div className="kanban-toolbar-left">
          <h1 className="kanban-title">Board</h1>
          {totalCount > 0 && (
            <span className="kanban-total-badge">{totalCount}</span>
          )}
        </div>

        <div className="kanban-toolbar-right">
          <input
            className="input kanban-search"
            placeholder="Search issues…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <input
            className="input kanban-jql"
            value={jql}
            onChange={(e) => setJql(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            placeholder="JQL filter…"
            title="Press Enter to apply JQL filter"
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleFetch}
            disabled={listLoading}
            title="Refresh"
          >
            {listLoading ? '…' : '↺ Refresh'}
          </button>
          <button
            className={`btn btn-sm${activeJobCount > 0 ? ' btn-primary' : ' btn-ghost'}`}
            onClick={() => setShowJobPanel((v) => !v)}
            title="Job execution tracker"
          >
            ▶ Jobs{activeJobCount > 0 ? ` (${activeJobCount})` : ''}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="alert alert-error kanban-error">
          <span>{error}</span>
          <button className="alert-close" onClick={() => dispatch(clearError())}>✕</button>
        </div>
      )}

      {/* ── Board ── */}
      {listLoading ? (
        <div className="kanban-loading">
          <Loader message="Fetching Jira issues…" />
        </div>
      ) : colNames.length === 0 ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-icon">📭</div>
          <h3>No issues found</h3>
          <p>Adjust your JQL filter or check your Jira credentials.</p>
        </div>
      ) : (
        <div className="kanban-board">
          {colNames.map((col) => (
            <KanbanColumn
              key={col}
              name={col}
              issues={filteredColumns[col] ?? []}
              color={STATUS_COLOR[col] ?? '#6b7280'}
              onCardClick={setDrawerIssue}
              onDrop={handleDrop}
              dragOverCol={dragOverCol}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              activeJobByIssue={activeJobByIssue}
            />
          ))}
        </div>
      )}

      {/* ── Task drawer ── */}
      {drawerIssue && (
        <TaskDrawer
          issue={drawerIssue}
          settings={settings}
          onClose={() => setDrawerIssue(null)}
          onResult={(key) => {
            setDrawerIssue(null);
            navigate(`/issue/${key}/result`);
          }}
        />
      )}

      {/* ── Job tracker panel (slide-in) ── */}
      {showJobPanel && (
        <>
          <div className="job-panel-backdrop" onClick={() => setShowJobPanel(false)} />
          <div className="job-panel-slide">
            <div className="job-panel-header">
              <span className="job-panel-title">▶ Workflow Executions</span>
              <button className="icon-btn" onClick={() => setShowJobPanel(false)}>✕</button>
            </div>
            <div className="job-panel-body">
              <JobTrackerPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
