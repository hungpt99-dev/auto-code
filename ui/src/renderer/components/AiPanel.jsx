import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AI_PROVIDERS, PROVIDER_MAP } from '../constants/aiProviders';
import { quickAsk, runCopilotCli, clearAnswer, clearCli } from '../store/aiSlice';

// ─── Sub-component: Provider Status Bar ──────────────────────────────────────

function ProviderStatus({ settings }) {
  return (
    <div className="provider-status-bar">
      {AI_PROVIDERS.map((p) => {
        const hasKey = !!settings[p.settingKey];
        return (
          <div key={p.id} className={`provider-pill ${hasKey ? 'provider-ok' : 'provider-missing'}`}>
            <span>{p.icon}</span>
            <span>{p.name}</span>
            <span className="provider-pill-dot">{hasKey ? '●' : '○'}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-component: Markdown-lite renderer (code blocks + paragraphs) ─────────

function AiAnswer({ text }) {
  if (!text) return null;

  // Split on fenced code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="ai-answer">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
          return (
            <pre key={i} className="ai-code-block">
              <code>{lines}</code>
            </pre>
          );
        }
        // Render plain paragraphs
        return (
          <div key={i} className="ai-answer-text">
            {part.split('\n').map((line, j) => (
              <p key={j}>{line || '\u00A0'}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ['quick-ask', 'copilot-cli'];

export default function AiPanel() {
  const dispatch = useDispatch();
  const settings = useSelector((s) => s.settings);
  const { asking, answer, askError, cliRunning, cliHistory, cliError } = useSelector((s) => s.ai);

  const [activeTab, setActiveTab]       = useState('quick-ask');
  const [question,  setQuestion]        = useState('');
  const [provider,  setProvider]        = useState(settings.aiProvider || 'openai');
  const [model,     setModel]           = useState('');
  const [cliSub,    setCliSub]          = useState('suggest');
  const [cliType,   setCliType]         = useState('shell');
  const [cliPrompt, setCliPrompt]       = useState('');

  const cliScrollRef = useRef(null);
  useEffect(() => {
    if (cliScrollRef.current) cliScrollRef.current.scrollTop = 0;
  }, [cliHistory.length]);

  const currentProvider = PROVIDER_MAP[provider];

  // ── Derive model list for selected provider ──
  const availableModels = currentProvider?.models ?? [];
  const selectedModel   = model || currentProvider?.defaultModel || '';

  // ── When provider changes, reset model ──
  function handleProviderChange(pid) {
    setProvider(pid);
    setModel('');
  }

  // ── Quick Ask ──
  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim()) return;
    await dispatch(quickAsk({
      question:  question.trim(),
      provider,
      model:     selectedModel,
      openaiKey: settings.openaiKey,
      claudeKey: settings.claudeKey,
      geminiKey: settings.geminiKey,
    }));
  }

  // ── Copilot CLI ──
  async function handleCliRun(e) {
    e.preventDefault();
    if (!cliPrompt.trim()) return;
    await dispatch(runCopilotCli({
      subcommand: cliSub,
      prompt:     cliPrompt.trim(),
      type:       cliSub === 'suggest' ? cliType : undefined,
    }));
    setCliPrompt('');
  }

  // ── Resolve key for selected provider ──
  const apiKey = settings[currentProvider?.settingKey] || '';
  const isConfigured = !!apiKey;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <h1>🤖 AI Assistant</h1>
      </div>

      <ProviderStatus settings={settings} />

      {/* ── Tabs ── */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button
          className={`tab${activeTab === 'quick-ask' ? ' tab--active' : ''}`}
          onClick={() => setActiveTab('quick-ask')}
        >
          💬 Quick Ask
        </button>
        <button
          className={`tab${activeTab === 'copilot-cli' ? ' tab--active' : ''}`}
          onClick={() => setActiveTab('copilot-cli')}
        >
          🐙 Copilot CLI
        </button>
      </div>

      {/* ══════════════ TAB: Quick Ask ══════════════ */}
      {activeTab === 'quick-ask' && (
        <div className="ai-panel-layout">
          {/* Left: form */}
          <div className="ai-controls">
            <div className="ai-card">
              <div className="ai-card-title">Select AI Provider</div>

              <div className="provider-grid">
                {AI_PROVIDERS.map((p) => {
                  const hasKey = !!settings[p.settingKey];
                  return (
                    <label
                      key={p.id}
                      className={`provider-card ${provider === p.id ? 'provider-card--active' : ''} ${!hasKey ? 'provider-card--disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="provider"
                        value={p.id}
                        checked={provider === p.id}
                        onChange={() => handleProviderChange(p.id)}
                        disabled={!hasKey}
                        style={{ display: 'none' }}
                      />
                      <span className="ai-icon">{p.icon}</span>
                      <div>
                        <div className="provider-card-name">{p.name}</div>
                        <div className="provider-card-desc">{p.description}</div>
                      </div>
                      {!hasKey && <span className="no-key-badge">No key</span>}
                    </label>
                  );
                })}
              </div>

              {/* Model selector */}
              {availableModels.length > 0 && (
                <div className="form-group" style={{ marginTop: 14, marginBottom: 0 }}>
                  <label htmlFor="ai-model">Model</label>
                  <select
                    id="ai-model"
                    className="input"
                    value={selectedModel}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="ai-card">
              <div className="ai-card-title">Ask a Question</div>

              {!isConfigured && (
                <div className="alert alert-error" style={{ marginBottom: 10 }}>
                  No API key configured for {currentProvider?.name}. Add it in Settings.
                </div>
              )}

              <form onSubmit={handleAsk} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  className="input"
                  rows={5}
                  placeholder="e.g. How should I structure a Spring Boot service layer for an Order API?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={asking || !isConfigured}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={asking || !question.trim() || !isConfigured}
                  >
                    {asking ? '⏳ Asking…' : '💬 Ask'}
                  </button>
                  {answer && (
                    <button type="button" className="btn btn-ghost" onClick={() => dispatch(clearAnswer())}>
                      Clear
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Right: answer */}
          <div className="ai-answer-col">
            <div className="ai-card" style={{ flex: 1 }}>
              <div className="ai-card-title">Response</div>

              {asking && (
                <div className="loader-wrap">
                  <div className="spinner" />
                  <p className="loader-text">{currentProvider?.name} is thinking…</p>
                </div>
              )}

              {askError && !asking && (
                <div className="alert alert-error">{askError}</div>
              )}

              {answer && !asking && (
                <AiAnswer text={answer} />
              )}

              {!answer && !asking && !askError && (
                <div className="ai-empty">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
                  <p>Ask any development question above.</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    Works with OpenAI, Claude, and Gemini — pick whichever is configured.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: Copilot CLI ══════════════ */}
      {activeTab === 'copilot-cli' && (
        <div className="ai-panel-layout">
          <div className="ai-controls">
            <div className="ai-card">
              <div className="ai-card-title">GitHub Copilot CLI</div>

              <p className="git-hint">
                Requires <code>gh</code> CLI and the Copilot extension:
              </p>
              <pre className="ai-code-block" style={{ marginBottom: 14 }}>
                {`gh extension install github/gh-copilot\ngh auth login`}
              </pre>

              <form onSubmit={handleCliRun} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Subcommand */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {['suggest', 'explain'].map((sub) => (
                    <label
                      key={sub}
                      className={`subcommand-pill${cliSub === sub ? ' subcommand-pill--active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="cliSub"
                        value={sub}
                        checked={cliSub === sub}
                        onChange={() => setCliSub(sub)}
                        style={{ display: 'none' }}
                      />
                      {sub}
                    </label>
                  ))}
                </div>

                {/* Shell type (only for suggest) */}
                {cliSub === 'suggest' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Target</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['shell', 'git', 'gh'].map((t) => (
                        <label
                          key={t}
                          className={`subcommand-pill${cliType === t ? ' subcommand-pill--active' : ''}`}
                        >
                          <input
                            type="radio"
                            name="cliType"
                            value={t}
                            checked={cliType === t}
                            onChange={() => setCliType(t)}
                            style={{ display: 'none' }}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="cmd-row">
                  <span className="cmd-prefix">gh copilot {cliSub}</span>
                  <input
                    className="input"
                    placeholder={cliSub === 'suggest' ? 'list all java files recursively' : 'git reset --hard HEAD'}
                    value={cliPrompt}
                    onChange={(e) => setCliPrompt(e.target.value)}
                    disabled={cliRunning}
                  />
                  <button className="btn btn-primary" type="submit" disabled={cliRunning || !cliPrompt.trim()}>
                    ▶ Run
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Output */}
          <div className="ai-answer-col">
            <div className="git-output-col" style={{ minHeight: 400 }}>
              <div className="git-output-header">
                <span>Output</span>
                {cliHistory.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => dispatch(clearCli())}>
                    🗑 Clear
                  </button>
                )}
              </div>

              <div className="git-output-scroll" ref={cliScrollRef}>
                {cliError && (
                  <div className="alert alert-error">{cliError}</div>
                )}
                {cliRunning && (
                  <div className="git-running">
                    <span className="spinner-sm" /> Running gh copilot…
                  </div>
                )}
                {cliHistory.length === 0 && !cliRunning && (
                  <div className="git-output-empty">No output yet. Run a command above.</div>
                )}
                {cliHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className={`git-output-entry${entry.exitCode !== 0 ? ' git-entry-error' : ''}`}
                  >
                    <div className="git-entry-header">
                      <span className="git-entry-cmd">
                        $ gh copilot {entry.args?.subcommand} &quot;{entry.args?.prompt}&quot;
                      </span>
                      <span className="git-entry-time">{entry.timestamp}</span>
                    </div>
                    {entry.stdout && <pre className="git-entry-out">{entry.stdout}</pre>}
                    {entry.stderr && <pre className="git-entry-err">{entry.stderr}</pre>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
