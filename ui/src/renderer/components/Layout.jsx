import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/',        label: 'Board',       icon: '📋', end: true  },
  { to: '/list',    label: 'List',        icon: '☰',  end: false },
  { to: '/ai',      label: 'AI Assistant',icon: '🤖', end: false },
  { to: '/git',     label: 'Git',         icon: '🗂️', end: false },
  { to: '/settings',label: 'Settings',   icon: '⚙️', end: false },
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
          {navItems.map(({ to, label, icon, end }) => (
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
          <span className="version">v1.1.0</span>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
