import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchIssueDetail } from '../store/issuesSlice';
import { startGeneration, resetGeneration } from '../store/aiSlice';
import { GENERATION_STEPS, PROVIDER_MAP } from '../constants/aiProviders';
import Loader from './Loader';

/**
 * Recursively extracts plain text from Atlassian Document Format (ADF) or
 * falls back gracefully when the field is already a plain string.
 */
function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text ?? '';
  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join(' ');
  }
  return '';
}

// ─── Generation step progress list ────────────────────────────────────────────────
function StepProgress({ completedSteps }) {
  return (
    <div className="step-list">
      {GENERATION_STEPS.map((step, idx) => {
        const done    = completedSteps.includes(idx);
        const current = !done && completedSteps.length === idx;
        return (
          <div key={step.id} className={`step-item ${done ? 'step-done' : current ? 'step-current' : 'step-pending'}`}>
            <span className="step-icon">
              {done ? '✓' : current ? <span className="spinner-sm" /> : '○'}
            </span>
            <span className="step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TaskDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { selectedIssue, detailLoading } = useSelector((s) => s.issues);
  const settings = useSelector((s) => s.settings);
  const { generating, completedSteps, genError } = useSelector((s) => s.ai);

  useEffect(() => {
    dispatch(
      fetchIssueDetail({
        jiraUrl: settings.jiraUrl,
        jiraEmail: settings.jiraEmail,
        jiraToken: settings.jiraToken,
        issueKey: key,
      })
    );
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    dispatch(resetGeneration());
    const result = await dispatch(startGeneration({ issueKey: key, settings }));
    if (startGeneration.fulfilled.match(result)) {
      navigate(`/issue/${key}/result`);
    }
  }

  if (detailLoading) return <Loader message="Loading issue details…" />;

  const issue = selectedIssue;
  if (!issue) {
    return (
      <div className="page">
        <div className="alert alert-error">Issue not found. Please go back and try again.</div>
      </div>
    );
  }

  const description = extractText(issue.fields.description);
  const comments = issue.fields.comment?.comments ?? [];

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1>{issue.key}</h1>
      </div>

      {/* ── Issue meta ── */}
      <div className="detail-card">
        <div className="detail-badges">
          <span className="badge badge-outline">{issue.fields.issuetype.name}</span>
          <span className="badge" style={{ backgroundColor: '#3b82f6' }}>
            {issue.fields.status.name}
          </span>
          {issue.fields.priority && (
            <span className="badge badge-outline">{issue.fields.priority.name}</span>
          )}
        </div>

        <h2 className="detail-title">{issue.fields.summary}</h2>

        <div className="detail-meta-grid">
          {issue.fields.assignee && (
            <div className="meta-item">
              <span className="meta-label">Assignee</span>
              <span>{issue.fields.assignee.displayName}</span>
            </div>
          )}
          {issue.fields.reporter && (
            <div className="meta-item">
              <span className="meta-label">Reporter</span>
              <span>{issue.fields.reporter.displayName}</span>
            </div>
          )}
        </div>

        <div className="section-heading">Description</div>
        <div className="description-text">
          {description || <em>No description provided.</em>}
        </div>

        {comments.length > 0 && (
          <>
            <div className="section-heading">
              Comments ({issue.fields.comment.total})
            </div>
            <div className="comments-list">
              {comments.slice(-5).map((c) => (
                <div key={c.id} className="comment-item">
                  <div className="comment-author">{c.author.displayName}</div>
                  <div className="comment-body">{extractText(c.body)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Generate ── */}
      {genError && (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>
          {genError}
        </div>
      )}

      <div className="generate-section">
        {/* Provider badge */}
        {settings.aiProvider && (
          <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
            Using {PROVIDER_MAP[settings.aiProvider]?.icon}{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {PROVIDER_MAP[settings.aiProvider]?.name}
            </strong>
            {settings.aiModel && ` • ${settings.aiModel}`}
          </div>
        )}

        <button
          className="btn btn-primary btn-large"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? '⏳ Generating…' : '🤖 Generate Code'}
        </button>

        {generating && (
          <div style={{ marginTop: 20 }}>
            <StepProgress completedSteps={completedSteps} />
          </div>
        )}
      </div>
    </div>
  );
}
