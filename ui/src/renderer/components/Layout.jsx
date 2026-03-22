import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/',          label: 'Dashboard', icon: '◉',  end: true  },
  { to: '/kanban',    label: 'Kanban',    icon: '▦',  end: false },
  { to: '/workflows', label: 'Workflows', icon: '⬡',  end: false },
  { to: '/history',   label: 'History',   icon: '⊞',  end: false },
  { to: '/settings',  label: 'Settings',  icon: '⚙',  end: false },
];

export default function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">⚡</div>
          <div className="brand-text">
            <span className="brand-name">Auto Code</span>
            <span className="brand-sub">AI Dev Assistant</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="status-dot" />
            <span className="status-text">Auto Code</span>
          </div>
          <span className="version-badge">v1.2.0</span>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
