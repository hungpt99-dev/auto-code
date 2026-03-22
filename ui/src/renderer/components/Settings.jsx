import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { saveSettings } from '../store/settingsSlice';
import { AI_PROVIDERS, PROVIDER_MAP } from '../constants/aiProviders';

const DEFAULTS = {
  jiraUrl: '',
  jiraEmail: '',
  jiraToken: '',
  openaiKey: '',
  claudeKey: '',
  geminiKey: '',
  aiProvider: 'openai',
  aiModel: '',
  n8nUrl: 'http://localhost:5678',
  repoPath: '',
};

export default function Settings() {
  const dispatch = useDispatch();
  const current = useSelector((s) => s.settings);

  const [form, setForm] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Sync from store once loaded
  useEffect(() => {
    if (current.loaded) {
      setForm({
        jiraUrl:     current.jiraUrl     ?? '',
        jiraEmail:   current.jiraEmail   ?? '',
        jiraToken:   current.jiraToken   ?? '',
        openaiKey:   current.openaiKey   ?? '',
        claudeKey:   current.claudeKey   ?? '',
        geminiKey:   current.geminiKey   ?? '',
        aiProvider:  current.aiProvider  || 'openai',
        aiModel:     current.aiModel     ?? '',
        n8nUrl:      current.n8nUrl      || 'http://localhost:5678',
        repoPath:    current.repoPath    ?? '',
      });
    }
  }, [current.loaded]);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaved(false);
    setTestResult(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    await dispatch(saveSettings(form));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleTestJira() {
    setTesting(true);
    setTestResult(null);
    const res = await window.electronAPI.fetchJiraIssues({
      jiraUrl: form.jiraUrl,
      jiraEmail: form.jiraEmail,
      jiraToken: form.jiraToken,
      jql: 'project is not EMPTY ORDER BY created DESC',
      maxResults: 1,
    });
    setTesting(false);
    setTestResult(
      res.success
        ? { type: 'success', message: '✅ Jira connection successful!' }
        : { type: 'error', message: `❌ ${res.error}` }
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>⚙️ Settings</h1>
      </div>

      <form className="settings-form" onSubmit={handleSave} autoComplete="off">
        {/* ── Jira ── */}
        <section className="settings-section">
          <h2>Jira</h2>

          <div className="form-group">
            <label htmlFor="jiraUrl">Jira Base URL</label>
            <input
              id="jiraUrl"
              className="input"
              name="jiraUrl"
              type="url"
              placeholder="https://yourcompany.atlassian.net"
              value={form.jiraUrl}
              onChange={handleChange}
              required
              autoComplete="off"
            />
            <span className="form-hint">Cloud or Server base URL (no trailing slash)</span>
          </div>

          <div className="form-group">
            <label htmlFor="jiraEmail">Email</label>
            <input
              id="jiraEmail"
              className="input"
              name="jiraEmail"
              type="email"
              placeholder="you@company.com"
              value={form.jiraEmail}
              onChange={handleChange}
              required
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="jiraToken">API Token</label>
            <input
              id="jiraToken"
              className="input"
              name="jiraToken"
              type="password"
              placeholder="••••••••••••••••"
              value={form.jiraToken}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
            <span className="form-hint">
              Generate at id.atlassian.com → Security → API tokens
            </span>
          </div>

          {testResult && (
            <div className={`alert alert-${testResult.type}`}>{testResult.message}</div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTestJira}
            disabled={testing || !form.jiraUrl || !form.jiraToken}
          >
            {testing ? 'Testing…' : '🔌 Test Jira Connection'}
          </button>
        </section>

        {/* ── AI Providers ── */}
        <section className="settings-section">
          <h2>🤖 AI Providers</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Configure API keys for the AI providers you want to use. The
            <strong style={{ color: 'var(--text-primary)' }}> Default Provider</strong> is used
            for full code generation via n8n.
          </p>

          {/* Default provider selector */}
          <div className="form-group">
            <label>Default Provider</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AI_PROVIDERS.map((p) => (
                <label
                  key={p.id}
                  className={`provider-card ${
                    form.aiProvider === p.id ? 'provider-card--active' : ''
                  } ${
                    !form[p.settingKey] ? 'provider-card--disabled' : ''
                  }`}
                  style={{ cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="aiProvider"
                    value={p.id}
                    checked={form.aiProvider === p.id}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, aiProvider: e.target.value, aiModel: '' }));
                      setSaved(false);
                    }}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Model selector for active provider */}
          {PROVIDER_MAP[form.aiProvider]?.models.length > 0 && (
            <div className="form-group">
              <label htmlFor="aiModel">Model</label>
              <select
                id="aiModel"
                className="input"
                name="aiModel"
                value={form.aiModel || PROVIDER_MAP[form.aiProvider].defaultModel}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, aiModel: e.target.value }));
                  setSaved(false);
                }}
              >
                {PROVIDER_MAP[form.aiProvider].models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Per-provider API keys */}
          {AI_PROVIDERS.map((p) => (
            <div className="form-group" key={p.id}>
              <label htmlFor={p.settingKey}>
                {p.icon} {p.name} API Key
              </label>
              <input
                id={p.settingKey}
                className="input"
                name={p.settingKey}
                type="password"
                placeholder="••••••••••••••••"
                value={form[p.settingKey]}
                onChange={handleChange}
                autoComplete="new-password"
              />
              <span className="form-hint">
                <a
                  href={p.apiUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Get API key ↗
                </a>
              </span>
            </div>
          ))}
        </section>

        {/* ── n8n ── */}
        <section className="settings-section">
          <h2>n8n Workflow Engine</h2>

          <div className="form-group">
            <label htmlFor="n8nUrl">n8n Base URL</label>
            <input
              id="n8nUrl"
              className="input"
              name="n8nUrl"
              type="url"
              placeholder="http://localhost:5678"
              value={form.n8nUrl}
              onChange={handleChange}
            />
            <span className="form-hint">Local n8n instance. Default: http://localhost:5678</span>
          </div>
        </section>

        {/* ── Git / Local Repo ── */}
        <section className="settings-section">
          <h2>🗂️ Local Repository</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Point the app to your local git repo so the Git panel can run
            <strong style={{ color: 'var(--text-primary)' }}> any</strong> local git command
            (commit, branch, stash, apply patch, etc.).<br />
            <span style={{ color: 'var(--warning)' }}>⚠️ git push is disabled</span> — code never
            leaves your machine automatically.
          </p>

          <div className="form-group">
            <label htmlFor="repoPath">Repository Path</label>
            <div className="input-with-btn">
              <input
                id="repoPath"
                className="input"
                name="repoPath"
                type="text"
                placeholder="C:\projects\your-repo"
                value={form.repoPath}
                onChange={handleChange}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const res = await window.electronAPI.selectFolder();
                  if (res.success) {
                    setForm((prev) => ({ ...prev, repoPath: res.folderPath }));
                  }
                }}
              >
                📁 Browse
              </button>
            </div>
            <span className="form-hint">Absolute path to your local git repository root.</span>
          </div>
        </section>

        {/* ── Save ── */}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-large">
            💾 Save Settings
          </button>
          {saved && <span className="save-badge">✅ Saved</span>}
        </div>
      </form>
    </div>
  );
}
