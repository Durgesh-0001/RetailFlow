import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  TrendingUp,
  Package,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  ChevronRight,
  Plus,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div
        style={{
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          padding: '10px 14px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>{label}</p>
        <p style={{ fontSize: 13, color: '#60a5fa', fontWeight: 600 }}>
          Revenue: ₹{payload[0]?.value?.toLocaleString()}
        </p>
        <p style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
          Profit: ₹{payload[1]?.value?.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [dashRes, overRes, trendRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/analytics/overview'),
        api.get('/analytics/revenue-trends', { params: { interval: 'daily' } }),
      ]);
      setDashboardData(dashRes.data.data);
      setOverviewData(overRes.data.data);
      setTrendData(trendRes.data.data.data.slice(-14));
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="loader-fullscreen">
        <div className="spinner" style={{ width: 36, height: 36 }} />
        <p style={{ color: 'var(--text-muted)' }}>Connecting to v2 Analytics Engine...</p>
      </div>
    );
  }

  const today = dashboardData?.today || { revenue: 0, profit: 0, cogs: 0, ordersCount: 0, revenueGrowthVsYesterday: 0 };
  const yesterday = dashboardData?.yesterday || { revenue: 0, profit: 0 };
  const financials = overviewData?.financials || { totalRevenue: 0, totalProfit: 0, profitMarginPercentage: 0 };
  const inventory = overviewData?.inventory || { totalProducts: 0, totalStockUnits: 0, outOfStockCount: 0 };
  const recentOrders = dashboardData?.recentOrders || [];
  const lowStockAlerts = dashboardData?.lowStockAlerts || [];

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const statusBadge = (s) => {
    const map = {
      Completed: 'badge-emerald',
      Pending: 'badge-amber',
      Processing: 'badge-indigo',
      Cancelled: 'badge-rose',
    };
    return <span className={`badge ${map[s] || 'badge-muted'}`}>{s}</span>;
  };

  const topActions = (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/orders')}>
        <Plus size={14} /> New Order
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>
        <Package size={14} /> Add Product
      </button>
    </div>
  );

  return (
    <Layout
      title={
        <span>
          {greeting},{' '}
          <span style={{ color: '#818cf8' }}>{user?.ownerName?.split(' ')[0] || 'Store Owner'} 👋</span>
        </span>
      }
      subtitle={`Live overview for ${user?.shopName || 'RetailFlow Store'} • ${now.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`}
      actions={topActions}
    >
      {/* ── 5 Core V2 Metric Cards ────────────────────────────────────────── */}
      <div className="stats-grid-v2 fade-up">
        {/* Today's Revenue */}
        <div className="stat-card-v2 stat-blue">
          <div className="stat-top">
            <div className="stat-icon-small bg-blue">
              <TrendingUp size={18} />
            </div>
            <div
              className={`stat-growth-badge ${
                today.revenueGrowthVsYesterday >= 0 ? 'positive' : 'negative'
              }`}
            >
              {today.revenueGrowthVsYesterday >= 0 ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownRight size={13} />
              )}
              {Math.abs(today.revenueGrowthVsYesterday)}% vs y'day
            </div>
          </div>
          <div className="stat-mid">
            <div className="stat-title">TODAY'S REVENUE</div>
            <div className="stat-value">₹{today.revenue.toLocaleString()}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Yesterday: ₹{yesterday.revenue.toLocaleString()}</div>
          </div>
        </div>

        {/* Today's Profit */}
        <div className="stat-card-v2 stat-green">
          <div className="stat-top">
            <div className="stat-icon-small bg-green">
              <DollarSign size={18} />
            </div>
            <div className="stat-growth-badge positive">
              Margin: {financials.profitMarginPercentage}%
            </div>
          </div>
          <div className="stat-mid">
            <div className="stat-title">TODAY'S PROFIT</div>
            <div className="stat-value">₹{today.profit.toLocaleString()}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">COGS: ₹{today.cogs.toLocaleString()}</div>
          </div>
        </div>

        {/* Today's Orders */}
        <div className="stat-card-v2 stat-purple">
          <div className="stat-top">
            <div className="stat-icon-small bg-purple">
              <ShoppingCart size={18} />
            </div>
            <span style={{ fontSize: '11px', color: '#c084fc', fontWeight: 600 }}>
              Avg: ₹{overviewData?.orders?.averageOrderValue || 0}
            </span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">TODAY'S ORDERS</div>
            <div className="stat-value">{today.ordersCount}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">All time: {overviewData?.orders?.total || 0} orders</div>
          </div>
        </div>

        {/* Total SKUs */}
        <div className="stat-card-v2 stat-gold">
          <div className="stat-top">
            <div className="stat-icon-small bg-gold">
              <Package size={18} />
            </div>
            <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>
              {inventory.totalStockUnits} units in stock
            </span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">ACTIVE INVENTORY</div>
            <div className="stat-value">{inventory.totalProducts} SKUs</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Value: ₹{inventory.inventoryRetailValue?.toLocaleString() || 0}</div>
          </div>
        </div>

        {/* Low Stock Warning */}
        <div className="stat-card-v2 stat-red">
          <div className="stat-top">
            <div className="stat-icon-small bg-red">
              <AlertTriangle size={18} />
            </div>
            <span
              className={`badge ${inventory.outOfStockCount > 0 ? 'badge-rose' : 'badge-amber'}`}
              style={{ padding: '2px 6px', fontSize: '10px' }}
            >
              {inventory.outOfStockCount} Out of Stock
            </span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">RESTOCK ALERTS</div>
            <div className="stat-value">{lowStockAlerts.length}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Needs replenishment</div>
          </div>
        </div>
      </div>

      {/* ── Main Chart & Low Stock Alert Area ──────────────────────────────── */}
      <div className="grid-main-side fade-up" style={{ animationDelay: '100ms', marginBottom: '24px' }}>
        {/* Revenue & Profit Trend Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">
                <BarChart2 size={18} color="#818cf8" /> Revenue & Profit Dynamics (14 Days)
              </span>
              <p className="card-subtitle">Real-time daily aggregates computed from Kafka order events</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/analytics')}>
              Full Analytics <ChevronRight size={13} />
            </button>
          </div>
          <div className="card-body">
            {trendData.length === 0 ? (
              <div className="empty-state">
                <Sparkles size={36} color="#818cf8" />
                <p>Waiting for sales transactions to populate live analytics.</p>
              </div>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#60a5fa"
                      strokeWidth={2.5}
                      fill="url(#gRevenue)"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Profit"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      fill="url(#gProfit)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts Box */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <AlertTriangle size={17} color="#f59e0b" /> Critical Stock Levels
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>
              Restock <ChevronRight size={13} />
            </button>
          </div>
          <div className="card-body" style={{ padding: '16px 20px' }}>
            {lowStockAlerts.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 10px' }}>
                <CheckCircle2 size={36} color="#10b981" />
                <p style={{ color: '#e2e8f0', marginTop: '8px' }}>Inventory Health Perfect</p>
                <span style={{ fontSize: '12px', color: '#64748b' }}>No products below threshold</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {lowStockAlerts.map((item) => (
                  <div
                    key={item._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        SKU: {item.sku || 'N/A'} • Min: {item.lowStockThreshold}
                      </div>
                    </div>
                    <span
                      className={`badge ${item.quantity === 0 ? 'badge-rose' : 'badge-amber'}`}
                      style={{ fontSize: '11px' }}
                    >
                      {item.quantity} {item.unit || 'units'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Orders Table ────────────────────────────────────────────── */}
      <div className="card fade-up" style={{ animationDelay: '200ms' }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Clock size={17} color="#a855f7" /> Latest Customer Orders
            </span>
            <p className="card-subtitle">Real-time dispatching with automated email invoicing</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>
            View All Orders <ChevronRight size={13} />
          </button>
        </div>
        <div className="table-wrap">
          {recentOrders.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={36} />
              <p>No orders created yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((ord) => (
                  <tr key={ord._id}>
                    <td style={{ fontWeight: 700, color: '#818cf8', fontFamily: 'monospace' }}>
                      {ord.orderNumber}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ord.customer?.name || 'Walk-in Customer'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {ord.customer?.phone || ord.customer?.email || '—'}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{ord.items?.length || 1} item(s)</td>
                    <td style={{ fontWeight: 700, color: '#fff' }}>₹{ord.finalAmount?.toLocaleString()}</td>
                    <td>{statusBadge(ord.status)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(ord.createdAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      • {new Date(ord.createdAt).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
