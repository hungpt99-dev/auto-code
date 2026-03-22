import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { runGitCommand, clearHistory, clearError } from '../store/gitSlice';

// ─── Quick-action presets shown as buttons ────────────────────────────────────
const QUICK_ACTIONS = [
  { label: '📋 Status',          args: ['status'] },
  { label: '📜 Log (20)',         args: ['log', '--oneline', '--graph', '--decorate', '-20'] },
  { label: '🔍 Diff (staged)',    args: ['diff', '--staged'] },
  { label: '🔍 Diff (unstaged)', args: ['diff'] },
  { label: '🌿 Branches',        args: ['branch', '-a'] },
  { label: '📦 Stash list',      args: ['stash', 'list'] },
];

export default function GitPanel() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const { history, loading, error } = useSelector((s) => s.git);
  const repoPath   = useSelector((s) => s.settings.repoPath);
  const generationResult = useSelector((s) => s.issues.generationResult);

  // ── Commit form ──
  const [commitMsg, setCommitMsg] = useState('');
  const [stageAll, setStageAll]   = useState(true);

  // ── Custom command form ──
  const [customCmd, setCustomCmd] = useState('');

  // ── Apply patch ──
  const [applyStatus, setApplyStatus] = useState(null);

  // ── Auto-scroll output ──
  const outputRef = useRef(null);
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = 0; // newest entry is at top
    }
  }, [history.length]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function run(args) {
    dispatch(runGitCommand({ repoPath, args }));
  }

  function handleQuick(args) { run(args); }

  function handleCommit(e) {
    e.preventDefault();
    if (!commitMsg.trim()) return;
    const steps = [];
    if (stageAll) steps.push(['add', '-A']);
    steps.push(['commit', '-m', commitMsg.trim()]);
    // Run sequentially – dispatch the second after a short delay
    // (both are async; we chain via Promise in a fire-and-forget)
    (async () => {
      for (const step of steps) {
        await dispatch(runGitCommand({ repoPath, args: step }));
      }
    })();
    setCommitMsg('');
  }

  function handleCustom(e) {
    e.preventDefault();
    const parts = customCmd.trim().split(/\s+/).filter(Boolean);
    // Strip leading "git" if user typed it
    const args = parts[0]?.toLowerCase() === 'git' ? parts.slice(1) : parts;
    if (!args.length) return;
    run(args);
    setCustomCmd('');
  }

  async function handleApplyPatch() {
    if (!generationResult?.patch) return;
    setApplyStatus(null);
    // Write patch to a temp file via the savePatch dialog — user picks location
    const saveRes = await window.electronAPI.savePatch({
      content: generationResult.patch,
      defaultName: 'ai-generated.diff',
    });
    if (!saveRes.success) return; // user cancelled
    // Now apply it
    const result = await dispatch(
      runGitCommand({ repoPath, args: ['apply', '--whitespace=fix', saveRes.filePath] })
    );
    setApplyStatus(
      result.error
        ? { type: 'error', message: result.payload }
        : { type: 'success', message: `Patch applied from ${saveRes.filePath}` }
    );
  }

  // ─── No repo configured ──────────────────────────────────────────────────────
  if (!repoPath) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🗂️</div>
        <h2>No repository configured</h2>
        <p>Set your local repository path in Settings, then come back here.</p>
        <button className="btn btn-primary" onClick={() => navigate('/settings')}>
          Open Settings
        </button>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <h1>🗂️ Local Git</h1>
        <code className="repo-path-badge">{repoPath}</code>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/settings')}>
          Change
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="alert-close" onClick={() => dispatch(clearError())}>✕</button>
        </div>
      )}

      <div className="git-layout">
        {/* ── LEFT COLUMN: controls ── */}
        <div className="git-controls">

          {/* Quick actions */}
          <div className="git-card">
            <h3 className="git-card-title">Quick Actions</h3>
            <div className="quick-actions">
              {QUICK_ACTIONS.map(({ label, args }) => (
                <button
                  key={label}
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleQuick(args)}
                  disabled={loading}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Commit */}
          <div className="git-card">
            <h3 className="git-card-title">Commit</h3>
            <form onSubmit={handleCommit} className="commit-form">
              <textarea
                className="input commit-msg"
                placeholder="Commit message…"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                rows={3}
                required
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={stageAll}
                  onChange={(e) => setStageAll(e.target.checked)}
                />
                Stage all changes first (git add -A)
              </label>
              <button className="btn btn-primary" type="submit" disabled={loading || !commitMsg.trim()}>
                ✅ Commit
              </button>
            </form>
          </div>

          {/* Apply AI patch */}
          <div className="git-card">
            <h3 className="git-card-title">Apply AI Patch</h3>
            <p className="git-hint">
              {generationResult?.patch
                ? 'A generated patch is available. Save it and apply to the repo.'
                : 'No generated patch available yet. Generate code first.'}
            </p>
            {applyStatus && (
              <div className={`alert alert-${applyStatus.type}`} style={{ marginBottom: 8 }}>
                {applyStatus.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-success"
                onClick={handleApplyPatch}
                disabled={loading || !generationResult?.patch}
              >
                🔀 Save & Apply Patch
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => run(['apply', '--check', '--whitespace=fix'])}
                disabled={loading || !generationResult?.patch}
                title="Dry-run — check if patch applies cleanly without touching files"
              >
                🔎 Dry-run Check
              </button>
            </div>
          </div>

          {/* Custom command */}
          <div className="git-card">
            <h3 className="git-card-title">Custom Command</h3>
            <p className="git-hint">
              Type any git command. <span style={{ color: 'var(--warning)' }}>git push is blocked.</span>
            </p>
            <form onSubmit={handleCustom} className="custom-cmd-form">
              <div className="cmd-row">
                <span className="cmd-prefix">git</span>
                <input
                  className="input"
                  placeholder="checkout -b feature/my-branch"
                  value={customCmd}
                  onChange={(e) => setCustomCmd(e.target.value)}
                  disabled={loading}
                  spellCheck={false}
                />
                <button className="btn btn-primary" type="submit" disabled={loading || !customCmd.trim()}>
                  ▶ Run
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── RIGHT COLUMN: output history ── */}
        <div className="git-output-col">
          <div className="git-output-header">
            <span>Output</span>
            {history.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => dispatch(clearHistory())}>
                🗑 Clear
              </button>
            )}
          </div>

          <div className="git-output-scroll" ref={outputRef}>
            {loading && (
              <div className="git-output-entry git-running">
                <span className="spinner-sm" /> Running…
              </div>
            )}

            {history.length === 0 && !loading && (
              <div className="git-output-empty">No output yet. Run a command.</div>
            )}

            {history.map((entry) => (
              <div
                key={entry.id}
                className={`git-output-entry${entry.exitCode !== 0 ? ' git-entry-error' : ''}`}
              >
                <div className="git-entry-header">
                  <span className="git-entry-cmd">$ git {entry.args.join(' ')}</span>
                  <span className="git-entry-time">{entry.timestamp}</span>
                  {entry.exitCode !== 0 && (
                    <span className="git-entry-code">exit {entry.exitCode}</span>
                  )}
                </div>
                {entry.stdout && (
                  <pre className="git-entry-out">{entry.stdout}</pre>
                )}
                {entry.stderr && (
                  <pre className="git-entry-err">{entry.stderr}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
