import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { startGeneration, resetGeneration } from '../store/aiSlice';
import { TASK_TYPES, LANG_AWARE_TASK_TYPES } from '../constants/taskTypes';
import { GENERATION_STEPS, PROVIDER_MAP } from '../constants/aiProviders';
import { useAppStore } from '../store/appStore';

// ─── Language list ────────────────────────────────────────────────────────────
const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript / Node.js' },
  { value: 'typescript', label: 'TypeScript'           },
  { value: 'python',     label: 'Python'               },
  { value: 'java',       label: 'Java / Spring Boot'   },
  { value: 'csharp',     label: 'C# / .NET'            },
  { value: 'go',         label: 'Go'                   },
  { value: 'rust',       label: 'Rust'                 },
  { value: 'php',        label: 'PHP'                  },
  { value: 'ruby',       label: 'Ruby'                 },
  { value: 'kotlin',     label: 'Kotlin'               },
  { value: 'swift',      label: 'Swift'                },
  { value: 'cpp',        label: 'C / C++'              },
];

const LANG_NAMES = LANGUAGES.map((l) => l.value).join(', ');
const TASK_IDS   = TASK_TYPES.map((t) => t.id).join(', ');

// ─── ADF → plain text ────────────────────────────────────────────────────────────
function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text ?? '';
  if (Array.isArray(node.content)) return node.content.map(extractText).join(' ');
  return '';
}

function StepProgress({ completedSteps }) {
  return (
    <div className="step-list">
      {GENERATION_STEPS.map((step, idx) => {
        const done    = completedSteps.includes(idx);
        const current = !done && completedSteps.length === idx;
        return (
          <div
            key={step.id}
            className={`step-item ${done ? 'step-done' : current ? 'step-current' : 'step-pending'}`}
          >
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

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <div className="drawer-section-label">{children}</div>;
}

// ─── TaskDrawer ───────────────────────────────────────────────────────────────
export default function TaskDrawer({ issue, settings, onClose, onResult }) {
  const dispatch = useDispatch();
  const { generating, completedSteps, genError } = useSelector((s) => s.ai);
  const generationResult = useSelector((s) => s.issues.generationResult);
  const { addHistoryEntry, recordGeneration } = useAppStore();

  // ── Drawer sub-tab ─────────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState('overview');

  const [fullIssue,     setFullIssue]     = useState(issue);
  const [loadingFull,   setLoadingFull]   = useState(true);
  const [taskType,      setTaskType]      = useState('code');
  const [language,      setLanguage]      = useState('javascript');
  const [selectedRepos, setSelectedRepos] = useState([]);
  const [detecting,     setDetecting]     = useState(false);
  const [detectResult,  setDetectResult]  = useState(null);
  const [detectError,   setDetectError]   = useState(null);

  // Track generation start time for duration recording
  const genStartRef = useRef(null);

  // Pre-select all repos on mount
  useEffect(() => {
    setSelectedRepos((settings.repos || []).map((r) => r.path));
  }, [(settings.repos || []).length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on issue change
  useEffect(() => {
    setLoadingFull(true);
    setFullIssue(issue);
    setDetectResult(null);
    setDetectError(null);
    setActiveTab('overview');
    dispatch(resetGeneration());
    setTaskType('code');

    window.electronAPI
      .fetchJiraIssue({
        jiraUrl:   settings.jiraUrl,
        jiraEmail: settings.jiraEmail,
        jiraToken: settings.jiraToken,
        issueKey:  issue.key,
      })
      .then((res) => {
        if (res.success) setFullIssue(res.data ?? res.issue ?? issue);
      })
      .finally(() => setLoadingFull(false));
  }, [issue.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch to Files tab when result arrives
  useEffect(() => {
    if (generationResult) setActiveTab('files');
  }, [generationResult]);

  // ── AI auto-detect ─────────────────────────────────────────────────────────
  const handleAutoDetect = useCallback(async () => {
    setDetecting(true);
    setDetectResult(null);
    setDetectError(null);

    const summary   = fullIssue?.fields?.summary ?? '';
    const desc      = extractText(fullIssue?.fields?.description).slice(0, 800);
    const issueType = fullIssue?.fields?.issuetype?.name ?? '';
    const repoNames = (settings.repos || []).map((r) => r.name).join(', ');

    const prompt = [
      'You are a senior software architect. Analyze this Jira issue and return ONLY a compact JSON object (no markdown, no prose):',
      `{ "taskType": "<one of: ${TASK_IDS}>", "language": "<one of: ${LANG_NAMES} | null>", "repos": [<names from: ${repoNames || 'none'}>] }`,
      '',
      `Issue type: ${issueType}`,
      `Summary: ${summary}`,
      `Description: ${desc}`,
      '',
      'Rules:',
      '- taskType: "bug" for bug/error/fix; "explain" for analysis/understanding; "review" for code review; "test" for tests/QA; "docs" for documentation; "refactor" for refactor/cleanup; "code" for everything else.',
      '- language: pick from the list based on keywords; null if unclear.',
      '- repos: only include repo names clearly relevant; can be [].',
    ].join('\n');

    const res = await window.electronAPI.aiQuickAsk({
      question:  prompt,
      provider:  settings.aiProvider,
      model:     settings.aiModel,
      openaiKey: settings.openaiKey,
      claudeKey: settings.claudeKey,
      geminiKey: settings.geminiKey,
    });

    if (!res.success) {
      setDetectError(res.error ?? 'AI detection failed');
      setDetecting(false);
      return;
    }

    try {
      const raw  = res.answer.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      const json = JSON.parse(raw);

      const detectedType  = TASK_TYPES.find((t) => t.id === json.taskType)?.id ?? 'code';
      const detectedLang  = LANGUAGES.find((l) => l.value === json.language)?.value ?? null;
      const detectedRepos = Array.isArray(json.repos)
        ? (settings.repos || [])
            .filter((r) => json.repos.some((n) =>
              typeof n === 'string' && r.name.toLowerCase().includes(n.toLowerCase())
            ))
            .map((r) => r.path)
        : [];

      setTaskType(detectedType);
      if (detectedLang) setLanguage(detectedLang);
      if (detectedRepos.length > 0) setSelectedRepos(detectedRepos);
      setDetectResult({ taskType: detectedType, language: detectedLang, repos: detectedRepos });
    } catch {
      setDetectError('Could not parse AI response. Please configure manually.');
    }
    setDetecting(false);
  }, [fullIssue, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle repo + auto-detect language ────────────────────────────────────
  async function toggleRepo(repoPath) {
    const next = selectedRepos.includes(repoPath)
      ? selectedRepos.filter((x) => x !== repoPath)
      : [...selectedRepos, repoPath];
    setSelectedRepos(next);
    if (next.length > 0 && window.electronAPI?.repoDetectLanguage) {
      try {
        const res = await window.electronAPI.repoDetectLanguage({ paths: next });
        if (res.language) setLanguage(res.language);
      } catch { /* ignore */ }
    }
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    dispatch(resetGeneration());
    genStartRef.current = Date.now();
    setActiveTab('generate');

    const result = await dispatch(
      startGeneration({
        issueKey:          fullIssue.key,
        settings,
        language,
        taskType,
        selectedRepoPaths: selectedRepos,
      })
    );

    const durationSec = Math.round((Date.now() - genStartRef.current) / 1000);
    const ok = startGeneration.fulfilled.match(result);

    // Record in Zustand history + dashboard stats
    if (ok) {
      addHistoryEntry({
        id:        Date.now(),
        issueKey:  fullIssue.key,
        taskType,
        language,
        summary:   result.payload?.summary ?? '',
        files:     result.payload?.files ?? [],
        patch:     result.payload?.patch ?? '',
        success:   true,
        timestamp: new Date().toISOString(),
      });
    }
    recordGeneration({ success: ok, durationSec });

    if (ok) onResult(fullIssue.key);
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const description = extractText(fullIssue?.fields?.description);
  const comments    = fullIssue?.fields?.comment?.comments ?? [];
  const statusName  = fullIssue?.fields?.status?.name ?? '';
  const typeName    = fullIssue?.fields?.issuetype?.name ?? '';
  const priority    = fullIssue?.fields?.priority?.name;
  const hasAiKey    = !!(settings.openaiKey || settings.claudeKey || settings.geminiKey);
  const files       = generationResult?.files ?? [];
  const patch       = generationResult?.patch ?? '';

  const TABS = [
    { id: 'overview',  label: 'Overview' },
    { id: 'generate',  label: 'Generate' },
    { id: 'files',     label: `Files${files.length ? ` (${files.length})` : ''}` },
    { id: 'patch',     label: 'Patch' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Drawer panel */}
      <aside className="drawer" role="complementary" aria-label="Task detail">
        {/* ── Header ── */}
        <div className="drawer-header">
          <div className="drawer-header-meta">
            <span className="drawer-key">{fullIssue.key}</span>
            <span className="badge" style={{ backgroundColor: '#3b82f6', fontSize: 11 }}>{statusName}</span>
            {typeName && <span className="badge badge-outline" style={{ fontSize: 11 }}>{typeName}</span>}
            {priority && <span className="badge badge-outline" style={{ fontSize: 11 }}>{priority}</span>}
          </div>
          <button className="btn btn-ghost btn-sm drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Sub-tabs ── */}
        <div className="drawer-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`drawer-tab${activeTab === t.id ? ' drawer-tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="drawer-body">
          {/* ── OVERVIEW tab ── */}
          {activeTab === 'overview' && (
            <>
              <h2 className="drawer-title">{fullIssue.fields.summary}</h2>
              <div className="drawer-meta-row">
                {fullIssue.fields?.assignee && (
                  <span className="drawer-meta-chip">👤 {fullIssue.fields.assignee.displayName}</span>
                )}
                {fullIssue.fields?.reporter && (
                  <span className="drawer-meta-chip">✍️ {fullIssue.fields.reporter.displayName}</span>
                )}
              </div>
              {loadingFull ? (
                <div className="drawer-loading">Loading details…</div>
              ) : (
                <>
                  {description && (
                    <div className="drawer-section">
                      <SectionLabel>Description</SectionLabel>
                      <div className="description-text">{description}</div>
                    </div>
                  )}
                  {comments.length > 0 && (
                    <div className="drawer-section">
                      <SectionLabel>Comments ({fullIssue.fields.comment.total})</SectionLabel>
                      <div className="comments-list">
                        {comments.slice(-4).map((c) => (
                          <div key={c.id} className="comment-item">
                            <div className="comment-author">{c.author.displayName}</div>
                            <div className="comment-body">{extractText(c.body)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <button
                className="btn btn-primary"
                style={{ marginTop: 20 }}
                onClick={() => setActiveTab('generate')}
              >
                🤖 Configure &amp; Generate →
              </button>
            </>
          )}

          {/* ── GENERATE tab ── */}
          {activeTab === 'generate' && (
            <div className="drawer-generate">
              {/* AI auto-detect */}
              <div className="auto-detect-row">
                <button
                  type="button"
                  className="btn-auto-detect"
                  onClick={handleAutoDetect}
                  disabled={detecting || generating || !hasAiKey}
                  title={!hasAiKey ? 'Configure an AI API key in Settings first' : 'Let AI analyze the issue'}
                >
                  {detecting ? '⏳ Analyzing…' : '✨ AI Auto-Detect'}
                </button>
                {detectResult && (
                  <span className="auto-detect-hint">
                    Applied&nbsp;
                    <span className="auto-detect-tag">
                      {TASK_TYPES.find((t) => t.id === detectResult.taskType)?.icon}&nbsp;
                      {TASK_TYPES.find((t) => t.id === detectResult.taskType)?.label}
                    </span>
                    {detectResult.language && (
                      <span className="auto-detect-tag" style={{ marginLeft: 4 }}>
                        {LANGUAGES.find((l) => l.value === detectResult.language)?.label}
                      </span>
                    )}
                  </span>
                )}
                {detectError && (
                  <span className="auto-detect-hint" style={{ color: 'var(--error)' }}>{detectError}</span>
                )}
              </div>

              {genError && <div className="alert alert-error">{genError}</div>}

              {/* Task type */}
              <div>
                <SectionLabel>Task Type</SectionLabel>
                <div className="task-type-grid drawer-task-grid">
                  {TASK_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`task-type-card ${taskType === t.id ? 'task-type-card--active' : ''}`}
                      style={taskType === t.id ? { borderColor: t.color } : {}}
                      onClick={() => setTaskType(t.id)}
                      disabled={generating}
                    >
                      <span className="task-type-icon">{t.icon}</span>
                      <div className="task-type-info">
                        <div className="task-type-name">{t.label}</div>
                        <div className="task-type-desc">{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Repos */}
              {(settings.repos || []).length > 0 && (
                <div>
                  <SectionLabel>Repositories to analyze</SectionLabel>
                  <div className="repo-selector">
                    {(settings.repos || []).map((repo) => (
                      <label
                        key={repo.id}
                        className="repo-check-item"
                        style={{ cursor: generating ? 'not-allowed' : 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRepos.includes(repo.path)}
                          onChange={() => !generating && toggleRepo(repo.path)}
                          disabled={generating}
                          style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }}
                        />
                        <span className="repo-check-name">{repo.name}</span>
                        <span className="repo-check-path">{repo.path}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Language */}
              {LANG_AWARE_TASK_TYPES.has(taskType) && (
                <div>
                  <SectionLabel>Language</SectionLabel>
                  <select
                    className="input"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={generating}
                    style={{ maxWidth: 260 }}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Provider */}
              {settings.aiProvider && (
                <div className="drawer-provider-badge">
                  {PROVIDER_MAP[settings.aiProvider]?.icon}{' '}
                  <strong>{PROVIDER_MAP[settings.aiProvider]?.name}</strong>
                  {settings.aiModel && ` · ${settings.aiModel}`}
                </div>
              )}

              <button
                className="btn btn-primary btn-large drawer-generate-btn"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? '⏳ Generating…' : '🤖 Generate Code'}
              </button>

              {generating && (
                <div style={{ marginTop: 16 }}>
                  <StepProgress completedSteps={completedSteps} />
                </div>
              )}
            </div>
          )}

          {/* ── FILES tab ── */}
          {activeTab === 'files' && (
            <div className="drawer-result-tab">
              {!generationResult ? (
                <div className="drawer-no-result">
                  <span>No result yet — run Generate first.</span>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setActiveTab('generate')}>
                    Go to Generate →
                  </button>
                </div>
              ) : (
                <>
                  {generationResult.summary && (
                    <div className="result-summary-box">
                      <SectionLabel>AI Summary</SectionLabel>
                      <p className="result-summary-text">{generationResult.summary}</p>
                    </div>
                  )}
                  <div className="result-actions-row">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setActiveTab('generate')}
                    >↺ Regenerate</button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        try {
                          const { default: JSZip } = await import('jszip');
                          const { saveAs } = await import('file-saver');
                          const zip = new JSZip();
                          files.forEach((f) => zip.file(f.filename || f.name || 'file.txt', f.content ?? ''));
                          const blob = await zip.generateAsync({ type: 'blob' });
                          saveAs(blob, `${fullIssue.key}-output.zip`);
                        } catch (e) { alert('Download failed: ' + e.message); }
                      }}
                      disabled={files.length === 0}
                    >⬇ Download ZIP</button>
                  </div>
                  {files.length === 0 ? (
                    <div className="drawer-no-result">No files in this output.</div>
                  ) : (
                    <div className="result-files-list">
                      {files.map((f, i) => (
                        <div key={i} className="result-file-card">
                          <div className="result-file-name">
                            <span className="result-file-icon">📄</span>
                            {f.filename || f.name}
                          </div>
                          <pre className="result-file-code">{f.content}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── PATCH tab ── */}
          {activeTab === 'patch' && (
            <div className="drawer-result-tab">
              {!generationResult ? (
                <div className="drawer-no-result">
                  <span>No result yet — run Generate first.</span>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setActiveTab('generate')}>
                    Go to Generate →
                  </button>
                </div>
              ) : (
                <>
                  <div className="result-actions-row">
                    <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('generate')}>
                      ↺ Regenerate
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const blob = new Blob([patch], { type: 'text/plain' });
                        const url  = URL.createObjectURL(blob);
                        const a    = document.createElement('a');
                        a.href = url; a.download = `${fullIssue.key}.patch`; a.click();
                        URL.revokeObjectURL(url);
                      }}
                      disabled={!patch}
                    >⬇ Download .patch</button>
                  </div>
                  {patch ? (
                    <pre className="result-patch-code">{patch}</pre>
                  ) : (
                    <div className="drawer-no-result">No patch generated for this output.</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
