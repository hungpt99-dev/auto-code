// ─── Dashboard — overview page (replaced by new implementation below) ─────────
import { useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { fetchIssues } from '../store/issuesSlice';
import { useAppStore } from '../store/appStore';

// ─── Status colour map ────────────────────────────────────────────────────────
const STATUS_COLOR = {
  'To Do':          '#6b7280',
  'Open':           '#6b7280',
  'Backlog':        '#475569',
  'In Progress':    '#3b82f6',
  'In Development': '#3b82f6',
  'In Review':      '#f59e0b',
  'Code Review':    '#f59e0b',
  'QA':             '#06b6d4',
  'Testing':        '#06b6d4',
  'UAT':            '#8b5cf6',
  'Blocked':        '#ef4444',
  'Done':           '#10b981',
  'Closed':         '#10b981',
  'Resolved':       '#10b981',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon, accent, sub }) {
  return (
    <div className="stat-card" style={{ '--card-accent': accent }}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value ?? 0}</div>
        <div className="stat-card-label">{label}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tooltip-row">
          <span style={{ color: p.color ?? p.fill }}>●</span> {p.value}
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const { list: issues, listLoading } = useSelector((s) => s.issues);
  const settings  = useSelector((s) => s.settings);
  const { dashboardStats } = useAppStore();

  // Auto-fetch on first load
  useEffect(() => {
    if (settings.loaded && settings.jiraUrl && settings.jiraToken) {
      dispatch(fetchIssues({ ...settings, jql: 'ORDER BY updated DESC' }));
    }
  }, [settings.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFetch = () =>
    dispatch(fetchIssues({ ...settings, jql: 'ORDER BY updated DESC' }));

  // Derived stats from issues list
  const stats = useMemo(() => {
    const total      = issues.length;
    const inProgress = issues.filter((i) =>
      ['In Progress', 'In Development', 'In Review', 'Code Review'].includes(
        i.fields?.status?.name
      )
    ).length;
    const completed = issues.filter((i) =>
      ['Done', 'Closed', 'Resolved'].includes(i.fields?.status?.name)
    ).length;
    const byStatus = {};
    issues.forEach((i) => {
      const s = i.fields?.status?.name || 'Unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    const tasksByStatus = Object.entries(byStatus)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 9);
    return { total, inProgress, completed, tasksByStatus };
  }, [issues]);

  const recent = useMemo(() =>
    [...issues]
      .sort((a, b) => new Date(b.fields?.updated) - new Date(a.fields?.updated))
      .slice(0, 8),
    [issues]
  );

  const successRate = (() => {
    const t = dashboardStats.successCount + dashboardStats.failedCount;
    return t > 0 ? Math.round((dashboardStats.successCount / t) * 100) : 0;
  })();

  return (
    <div className="dashboard-page">
      {/* ── Page header ── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            {listLoading ? 'Loading tasks…' : `${stats.total} tasks synced from Jira`}
          </p>
        </div>
        <div className="dash-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleFetch} disabled={listLoading}>
            {listLoading ? '⏳' : '↻'} Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/kanban')}>
            Open Kanban
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <section className="dash-section">
        <div className="stat-cards-grid">
          <StatCard label="Total Tasks"   value={stats.total}      icon="📋" accent="var(--accent)" />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            icon="⚡"
            accent="#3b82f6"
            sub={stats.total ? `${Math.round(stats.inProgress / stats.total * 100)}% of total` : '–'}
          />
          <StatCard
            label="AI Generated"
            value={dashboardStats.aiGenerationsToday}
            icon="🤖"
            accent="#8b5cf6"
            sub="today"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon="✅"
            accent="#10b981"
            sub={stats.total ? `${Math.round(stats.completed / stats.total * 100)}%` : '–'}
          />
        </div>
      </section>

      {/* ── Charts ── */}
      <section className="dash-section dash-charts-row">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-title">Tasks by Status</h3>
            {listLoading && <span className="chart-loading-dot" />}
          </div>
          {stats.tasksByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={stats.tasksByStatus} margin={{ top: 4, right: 8, left: -22, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="status" tick={{ fill: '#7070a0', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: '#7070a0', fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.tasksByStatus.map((e) => (
                    <Cell key={e.status} fill={STATUS_COLOR[e.status] ?? '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No tasks — fetch from Jira to see stats</div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-title">AI Usage — Last 7 Days</h3>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={dashboardStats.aiUsageLast7Days} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#7070a0', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7070a0', fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(99,102,241,0.25)', strokeWidth: 2 }} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5}
                dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#818cf8' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Bottom row: AI activity + recent tasks ── */}
      <section className="dash-section dash-bottom-row">
        {/* AI Activity card */}
        <div className="dash-card">
          <h3 className="dash-card-title">🤖 AI Activity</h3>
          <div className="ai-stat-grid">
            <div className="ai-stat-item">
              <span className="ai-stat-val">{dashboardStats.aiGenerationsToday}</span>
              <span className="ai-stat-lbl">Today</span>
            </div>
            <div className="ai-stat-item">
              <span className="ai-stat-val" style={{ color: 'var(--success)' }}>{dashboardStats.successCount}</span>
              <span className="ai-stat-lbl">Success</span>
            </div>
            <div className="ai-stat-item">
              <span className="ai-stat-val" style={{ color: 'var(--error)' }}>{dashboardStats.failedCount}</span>
              <span className="ai-stat-lbl">Failed</span>
            </div>
            <div className="ai-stat-item">
              <span className="ai-stat-val" style={{ color: 'var(--accent)' }}>{dashboardStats.avgGenTimeSec}s</span>
              <span className="ai-stat-lbl">Avg time</span>
            </div>
          </div>

          <div className="ai-success-bar-row">
            <span className="ai-success-lbl">Success rate</span>
            <div className="ai-progress-bar">
              <div className="ai-progress-fill" style={{ width: `${successRate}%` }} />
            </div>
            <span className="ai-success-pct">{successRate}%</span>
          </div>

          <div style={{ marginTop: 20 }}>
            <h4 className="dash-quick-title">Quick Actions</h4>
            <div className="dash-quick-grid">
              <button className="quick-btn" onClick={handleFetch} disabled={listLoading}>⟳ Fetch Jira</button>
              <button className="quick-btn" onClick={() => navigate('/kanban')}>📋 Kanban</button>
              <button className="quick-btn" onClick={() => navigate('/workflows')}>⬡ Workflows</button>
              <button className="quick-btn" onClick={() => navigate('/history')}>⊞ History</button>
            </div>
          </div>
        </div>

        {/* Recent tasks */}
        <div className="dash-card dash-card--wide">
          <div className="dash-card-header-row">
            <h3 className="dash-card-title">🕐 Recent Tasks</h3>
            <button className="link-btn" onClick={() => navigate('/kanban')}>View all →</button>
          </div>
          {recent.length === 0 ? (
            <div className="dash-empty">
              <p>No tasks yet.</p>
              <button className="btn btn-ghost btn-sm" onClick={handleFetch}>Fetch from Jira</button>
            </div>
          ) : (
            <div className="recent-task-list">
              {recent.map((issue) => {
                const status = issue.fields?.status?.name ?? '';
                const updated = issue.fields?.updated
                  ? new Date(issue.fields.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <div
                    key={issue.id}
                    className="recent-task-row"
                    onClick={() => navigate('/kanban')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate('/kanban')}
                  >
                    <span className="recent-task-key">{issue.key}</span>
                    <span className="recent-task-summary">{issue.fields?.summary}</span>
                    <span className="recent-task-status" style={{ color: STATUS_COLOR[status] ?? '#6b7280' }}>{status}</span>
                    <span className="recent-task-date">{updated}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
