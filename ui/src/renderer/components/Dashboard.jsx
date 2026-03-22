import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchIssues, clearError } from '../store/issuesSlice';
import Loader from './Loader';

const STATUS_COLOR = {
  'To Do': '#6b7280',
  'In Progress': '#3b82f6',
  'Done': '#10b981',
  'In Review': '#f59e0b',
  'Blocked': '#ef4444',
};

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { list: issues, listLoading, error } = useSelector((s) => s.issues);
  const settings = useSelector((s) => s.settings);

  const [jql, setJql] = useState('assignee = currentUser() ORDER BY updated DESC');

  // Auto-fetch when settings are first loaded
  useEffect(() => {
    if (settings.loaded && settings.jiraUrl && settings.jiraToken) {
      handleFetch();
    }
  }, [settings.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFetch() {
    dispatch(
      fetchIssues({
        jiraUrl: settings.jiraUrl,
        jiraEmail: settings.jiraEmail,
        jiraToken: settings.jiraToken,
        jql,
      })
    );
  }

  // ── Not configured ──
  if (settings.loaded && !settings.jiraUrl) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚙️</div>
        <h2>No Jira configuration found</h2>
        <p>Add your Jira credentials in Settings before fetching issues.</p>
        <button className="btn btn-primary" onClick={() => navigate('/settings')}>
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <h1>Jira Issues</h1>
        <div className="header-actions">
          <input
            className="input jql-input"
            value={jql}
            onChange={(e) => setJql(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            placeholder="JQL query…"
            aria-label="JQL query"
          />
          <button
            className="btn btn-primary"
            onClick={handleFetch}
            disabled={listLoading}
          >
            {listLoading ? 'Loading…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="alert-close" onClick={() => dispatch(clearError())}>✕</button>
        </div>
      )}

      {/* ── Body ── */}
      {listLoading ? (
        <Loader message="Fetching Jira issues…" />
      ) : issues.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No issues found</h3>
          <p>Try a different JQL query or check your credentials.</p>
        </div>
      ) : (
        <div className="issue-list">
          {issues.map((issue) => {
            const statusName = issue.fields.status.name;
            return (
              <div
                key={issue.id}
                className="issue-card"
                onClick={() => navigate(`/issue/${issue.key}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/issue/${issue.key}`)}
              >
                <div className="issue-key">{issue.key}</div>

                <div className="issue-summary">{issue.fields.summary}</div>

                <div className="issue-meta">
                  <span
                    className="badge"
                    style={{ backgroundColor: STATUS_COLOR[statusName] ?? '#6b7280' }}
                  >
                    {statusName}
                  </span>
                  <span className="badge badge-outline">{issue.fields.issuetype.name}</span>
                  {issue.fields.priority && (
                    <span className="badge badge-outline">{issue.fields.priority.name}</span>
                  )}
                  {issue.fields.assignee && (
                    <span className="assignee">
                      👤 {issue.fields.assignee.displayName}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
