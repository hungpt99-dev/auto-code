import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '📋 Dashboard', end: true },
  { to: '/ai', label: '🤖 AI Assistant', end: false },
  { to: '/git', label: '🗂️ Git', end: false },
  { to: '/settings', label: '⚙️ Settings', end: false },
];

export default function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-name">Auto Code</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="version">v1.0.0</span>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
