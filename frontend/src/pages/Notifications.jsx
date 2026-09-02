import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  Bell,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

const TYPE_BADGES = {
  INVOICE: 'badge-emerald',
  ORDER_STATUS: 'badge-indigo',
  LOW_STOCK: 'badge-amber',
  CUSTOM_ALERT: 'badge-purple',
};

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Test email state
  const [testForm, setTestForm] = useState({
    to: user?.email || '',
    subject: 'RetailFlow v2 Test Notification',
    message: 'This is a test notification confirming that Kafka and Email Workers are connected.',
  });
  const [sendingTest, setSendingTest] = useState(false);

  const loadNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    setSendingTest(true);
    try {
      const { data } = await api.post('/notifications/test', testForm);
      toast.success(data.message || 'Test notification dispatched!');
      loadNotifications();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch test notification.');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <Layout
      title="Notifications & Audit Center"
      subtitle="Inspect transactional email events, Kafka consumer worker dispatching, and run test alerts"
      actions={
        <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spinner' : ''} /> Refresh Logs
        </button>
      }
    >
      {/* ── Top Worker Status Architecture Overview ───────────────────────── */}
      <div className="stats-grid-v2 fade-up">
        <div className="stat-card-v2 stat-blue">
          <div className="stat-top">
            <div className="stat-icon-small bg-blue">
              <Server size={18} />
            </div>
            <span className="badge badge-indigo">Kafka Group</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">EMAIL CONSUMER</div>
            <div className="stat-value" style={{ fontSize: '20px' }}>
              retailflow-notification-group
            </div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Asynchronous order & invoice worker</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-green">
          <div className="stat-top">
            <div className="stat-icon-small bg-green">
              <ShieldCheck size={18} />
            </div>
            <span className="badge badge-emerald">Active Guard</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">REDIS IDEMPOTENCY</div>
            <div className="stat-value" style={{ fontSize: '20px' }}>
              Zero Duplicates
            </div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">At-Least-Once Kafka safety enabled</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-purple">
          <div className="stat-top">
            <div className="stat-icon-small bg-purple">
              <Mail size={18} />
            </div>
            <span className="badge badge-purple">Total Events</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">NOTIFICATIONS DISPATCHED</div>
            <div className="stat-value">{notifications.length}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Invoices, alerts & status emails</div>
          </div>
        </div>
      </div>

      {/* ── Main 2 Column Grid: Notification Logs & Send Test ──────────────── */}
      <div className="grid-main-side fade-up" style={{ animationDelay: '100ms' }}>
        {/* Email Logs Table */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Bell size={17} color="#a855f7" /> Transactional Email Event Log
            </span>
          </div>
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">
                <div className="spinner" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="empty-state">
                <Mail size={40} />
                <p>No notifications recorded yet.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Type</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n._id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                          {n.recipient}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Target: {n.recipientType}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${TYPE_BADGES[n.type] || 'badge-muted'}`}>
                          {n.type}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {n.subject}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            n.status === 'sent'
                              ? 'badge-emerald'
                              : n.status === 'simulated'
                              ? 'badge-cyan'
                              : 'badge-rose'
                          }`}
                        >
                          {n.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(n.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        • {new Date(n.createdAt).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Send Test Email Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Send size={17} color="#38bdf8" /> Dispatch Test Email
            </span>
          </div>
          <div className="card-body">
            <form onSubmit={handleSendTest}>
              <div className="form-group">
                <label>Recipient Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  value={testForm.to}
                  onChange={(e) =>
                    setTestForm((f) => ({ ...f, to: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Subject</label>
                <input
                  className="form-input"
                  value={testForm.subject}
                  onChange={(e) =>
                    setTestForm((f) => ({ ...f, subject: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Message Content</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={testForm.message}
                  onChange={(e) =>
                    setTestForm((f) => ({ ...f, message: e.target.value }))
                  }
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={sendingTest}
              >
                {sendingTest ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <Send size={14} /> Send Test Alert
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
