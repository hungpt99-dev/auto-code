import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { startGeneration, resetGeneration } from '../store/aiSlice';
import { TASK_TYPES, LANG_AWARE_TASK_TYPES } from '../constants/taskTypes';
import { GENERATION_STEPS, PROVIDER_MAP } from '../constants/aiProviders';

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

  const [fullIssue,     setFullIssue]     = useState(issue);
  const [loadingFull,   setLoadingFull]   = useState(true);
  const [taskType,      setTaskType]      = useState('code');
  const [language,      setLanguage]      = useState('javascript');
  const [selectedRepos, setSelectedRepos] = useState([]);
  const [detecting,     setDetecting]     = useState(false);
  const [detectResult,  setDetectResult]  = useState(null);
  const [detectError,   setDetectError]   = useState(null);

  // Pre-select all repos on mount
  useEffect(() => {
    setSelectedRepos((settings.repos || []).map((r) => r.path));
  }, [(settings.repos || []).length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch full issue detail when issue changes
  useEffect(() => {
    setLoadingFull(true);
    setFullIssue(issue);
    setDetectResult(null);
    setDetectError(null);
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

  // ── AI auto-detect: analyze issue → pick taskType + language + repos ──────
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

  // ── Toggle repo + auto-detect language from selected repos ───────────────
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

  async function handleGenerate() {
    dispatch(resetGeneration());
    const result = await dispatch(
      startGeneration({
        issueKey:          fullIssue.key,
        settings,
        language,
        taskType,
        selectedRepoPaths: selectedRepos,
      })
    );
    if (startGeneration.fulfilled.match(result)) {
      onResult(fullIssue.key);
    }
  }

  const description = extractText(fullIssue?.fields?.description);
  const comments    = fullIssue?.fields?.comment?.comments ?? [];
  const statusName  = fullIssue?.fields?.status?.name ?? '';
  const typeName    = fullIssue?.fields?.issuetype?.name ?? '';
  const priority    = fullIssue?.fields?.priority?.name;
  const hasAiKey    = !!(settings.openaiKey || settings.claudeKey || settings.geminiKey);

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
            <span className="badge" style={{ backgroundColor: '#3b82f6', fontSize: 11 }}>
              {statusName}
            </span>
            {typeName && (
              <span className="badge badge-outline" style={{ fontSize: 11 }}>{typeName}</span>
            )}
            {priority && (
              <span className="badge badge-outline" style={{ fontSize: 11 }}>{priority}</span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="drawer-body">
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

          {/* ── Generate section ── */}
          <div className="drawer-generate">

            {/* AI auto-detect */}
            <div className="auto-detect-row">
              <button
                type="button"
                className="btn-auto-detect"
                onClick={handleAutoDetect}
                disabled={detecting || generating || !hasAiKey}
                title={!hasAiKey
                  ? 'Configure an AI API key in Settings first'
                  : 'Let AI analyze the issue and automatically pick task type, language and repos'
                }
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
                <span className="auto-detect-hint" style={{ color: 'var(--error)' }}>
                  {detectError}
                </span>
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

            {/* Repos — selecting a repo auto-detects language */}
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

            {/* Language — auto-updated after repo selection; only for code tasks */}
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
              {generating ? '⏳ Generating…' : '🤖 Generate'}
            </button>

            {generating && (
              <div style={{ marginTop: 16 }}>
                <StepProgress completedSteps={completedSteps} />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
