import Sidebar from './Sidebar';
import SystemHealthBadge from './SystemHealthBadge';

export default function Layout({ title, subtitle, actions, children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="topbar-actions">
            <SystemHealthBadge />
            {actions}
          </div>
        </header>
        <section className="page-body">{children}</section>
      </main>
    </div>
  );
}
