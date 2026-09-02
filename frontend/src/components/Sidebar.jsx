import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  BarChart3,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Bell,
  LogOut,
  Store,
  Sparkles,
} from 'lucide-react';

const navItems = [
  { to: '/',              icon: LayoutDashboard, label: 'Live Dashboard' },
  { to: '/analytics',     icon: BarChart3,       label: 'Analytics Engine' },
  { to: '/inventory',     icon: Package,         label: 'Inventory' },
  { to: '/orders',        icon: ShoppingCart,    label: 'Orders & Invoices' },
  { to: '/finance',       icon: TrendingUp,      label: 'Finance Ledger' },
  { to: '/employees',     icon: Users,           label: 'Staff & Attendance' },
  { to: '/notifications', icon: Bell,            label: 'Email & Audit' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials =
    user?.ownerName
      ?.split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'RF';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Store size={20} color="#fff" />
        </div>
        <div className="sidebar-brand-text">
          <h2>{user?.shopName || 'RetailFlow'}</h2>
          <span className="version-tag">v2.0 Event-Driven</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Management Core</div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <p>{user?.ownerName || 'Store Owner'}</p>
            <span>{user?.email || 'owner@retailflow.io'}</span>
          </div>
          <button className="logout-btn" title="Sign Out" onClick={handleLogout}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
