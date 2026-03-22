import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';

// ─── History list item ────────────────────────────────────────────────────────
function HistoryItem({ entry, selected, onClick, onDelete }) {
  const date = new Date(entry.timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div
      className={`history-item${selected ? ' history-item--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="history-item-top">
        <div className="history-item-left">
          <span className="history-item-key">{entry.issueKey}</span>
          <span className={`history-item-status${entry.success ? ' history-item-status--ok' : ' history-item-status--fail'}`}>
            {entry.success ? '✓' : '✗'}
          </span>
        </div>
        <button
          className="icon-btn icon-btn--danger"
          title="Delete entry"
          onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
        >✕</button>
      </div>
      <div className="history-item-summary">{entry.summary || 'No summary'}</div>
      <div className="history-item-meta">
        <span className="history-badge history-badge--type">{entry.taskType}</span>
        <span className="history-badge history-badge--lang">{entry.language}</span>
        {entry.files?.length > 0 && (
          <span className="history-badge">{entry.files.length} files</span>
        )}
        <span className="history-item-date">{date}</span>
      </div>
    </div>
  );
}

// ─── History detail panel ────────────────────────────────────────────────────
function HistoryDetail({ entry }) {
  const [tab, setTab] = useState('summary');

  if (!entry) {
    return (
      <div className="history-detail-empty">
        <div className="empty-icon-lg">📦</div>
        <p>Select an entry to view its details</p>
      </div>
    );
  }

  const TABS = ['summary', 'files', 'patch'];
  const files = entry.files ?? [];
  const patch = entry.patch ?? '';

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${entry.issueKey}-${entry.taskType}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="history-detail">
      {/* Header */}
      <div className="history-detail-header">
        <div>
          <div className="history-detail-key">{entry.issueKey}</div>
          <div className="history-detail-meta">
            <span className="history-badge history-badge--type">{entry.taskType}</span>
            <span className="history-badge history-badge--lang">{entry.language}</span>
            <span className={`history-badge${entry.success ? ' history-badge--ok' : ' history-badge--fail'}`}>
              {entry.success ? '✓ Success' : '✗ Failed'}
            </span>
            <span className="history-item-date">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>⬇ Export</button>
      </div>

      {/* Sub-tabs */}
      <div className="history-detail-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`history-detail-tab${tab === t ? ' history-detail-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'files' ? `Files${files.length ? ` (${files.length})` : ''}` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="history-detail-body">
        {tab === 'summary' && (
          <div className="history-summary-text">
            {entry.summary || <em style={{ color: 'var(--text-muted)' }}>No summary generated.</em>}
          </div>
        )}

        {tab === 'files' && (
          <div className="history-files-list">
            {files.length === 0 ? (
              <em style={{ color: 'var(--text-muted)' }}>No files in this output.</em>
            ) : (
              files.map((f, i) => (
                <div key={i} className="history-file-card">
                  <div className="history-file-name">📄 {f.filename || f.name || `file-${i + 1}`}</div>
                  <pre className="history-file-code">
                    {(f.content ?? '').slice(0, 2000)}
                    {(f.content ?? '').length > 2000 ? '\n… (truncated)' : ''}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'patch' && (
          <pre className="history-patch-code">
            {patch || <em style={{ color: 'var(--text-muted)' }}>No patch generated.</em>}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────
export default function HistoryTab() {
  const { history, deleteHistoryEntry, clearHistory } = useAppStore();
  const [selectedId,  setSelectedId]  = useState(null);
  const [textFilter,  setTextFilter]  = useState('');
  const [typeFilter,  setTypeFilter]  = useState('all');

  const filtered = useMemo(() =>
    history.filter((h) => {
      const matchText = !textFilter ||
        h.issueKey?.toLowerCase().includes(textFilter.toLowerCase()) ||
        h.summary?.toLowerCase().includes(textFilter.toLowerCase());
      const matchType = typeFilter === 'all' || h.taskType === typeFilter;
      return matchText && matchType;
    }),
    [history, textFilter, typeFilter]
  );

  const selectedEntry = history.find((h) => h.id === selectedId);

  return (
    <div className="history-page">
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">
            {history.length} AI generation{history.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        {history.length > 0 && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (window.confirm('Clear all history? This cannot be undone.')) {
                clearHistory();
                setSelectedId(null);
              }
            }}
          >
            🗑 Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="history-empty-state">
          <div className="empty-icon-lg">🕰</div>
          <h3>No history yet</h3>
          <p>AI-generated results will appear here after your first generation run.</p>
        </div>
      ) : (
        <div className="history-layout">
          {/* ── List ── */}
          <div className="history-list-col">
            <div className="history-filters">
              <input
                className="form-input form-input--sm"
                placeholder="Search key or summary…"
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
              />
              <select
                className="form-select form-select--sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                <option value="code">Code</option>
                <option value="bug">Bug Fix</option>
                <option value="review">Review</option>
                <option value="test">Tests</option>
                <option value="docs">Docs</option>
                <option value="refactor">Refactor</option>
                <option value="explain">Explain</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="history-filter-empty">No results match your filter.</div>
            ) : (
              filtered.map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onClick={() => setSelectedId(entry.id)}
                  onDelete={(id) => {
                    deleteHistoryEntry(id);
                    if (selectedId === id) setSelectedId(null);
                  }}
                />
              ))
            )}
          </div>

          {/* ── Detail ── */}
          <div className="history-detail-col">
            <HistoryDetail entry={selectedEntry} />
          </div>
        </div>
      )}
    </div>
  );
}
