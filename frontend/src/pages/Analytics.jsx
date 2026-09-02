import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import {
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Users,
  Clock,
  Award,
  Layers,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export default function Analytics() {
  const [interval, setInterval] = useState('daily');
  const [trendData, setTrendData] = useState({ summary: {}, data: [] });
  const [productData, setProductData] = useState({ topSellingProducts: [], categories: [] });
  const [orderData, setOrderData] = useState({ byStatus: [], byHourOfDay: [] });
  const [customerData, setCustomerData] = useState({ topCustomers: [] });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const [trends, products, orders, customers, over] = await Promise.all([
        api.get('/analytics/revenue-trends', { params: { interval } }),
        api.get('/analytics/products', { params: { limit: 8 } }),
        api.get('/analytics/orders'),
        api.get('/analytics/customers', { params: { limit: 8 } }),
        api.get('/analytics/overview'),
      ]);
      setTrendData(trends.data.data);
      setProductData(products.data.data);
      setOrderData(orders.data.data);
      setCustomerData(customers.data.data);
      setOverview(over.data.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [interval]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  if (loading) {
    return (
      <div className="loader-fullscreen">
        <div className="spinner" style={{ width: 36, height: 36 }} />
        <p style={{ color: 'var(--text-muted)' }}>Aggregating multi-dimensional shop metrics...</p>
      </div>
    );
  }

  const summary = trendData.summary || { totalRevenue: 0, totalProfit: 0, totalCOGS: 0, totalSales: 0 };
  const financials = overview?.financials || { profitMarginPercentage: 0 };

  const topActions = (
    <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={refreshing}>
      <RefreshCw size={13} className={refreshing ? 'spinner' : ''} /> Refresh Engine
    </button>
  );

  return (
    <Layout
      title="Shop Analytics Engine"
      subtitle="Comprehensive financial telemetry, sales velocity, peak hours, and customer retention"
      actions={topActions}
    >
      {/* ── High Level Financial Summary Cards ────────────────────────────── */}
      <div className="stats-grid-v2 fade-up">
        <div className="stat-card-v2 stat-blue">
          <div className="stat-top">
            <div className="stat-icon-small bg-blue">
              <TrendingUp size={18} />
            </div>
            <span className="badge badge-indigo">Selected Period</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">AGGREGATE REVENUE</div>
            <div className="stat-value">₹{summary.totalRevenue?.toLocaleString() || 0}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Across {summary.totalSales || 0} transaction batches</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-green">
          <div className="stat-top">
            <div className="stat-icon-small bg-green">
              <Award size={18} />
            </div>
            <span className="badge badge-emerald">{financials.profitMarginPercentage}% Margin</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">NET PROFIT GENERATED</div>
            <div className="stat-value">₹{summary.totalProfit?.toLocaleString() || 0}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">COGS: ₹{summary.totalCOGS?.toLocaleString() || 0}</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-purple">
          <div className="stat-top">
            <div className="stat-icon-small bg-purple">
              <Users size={18} />
            </div>
            <span className="badge badge-purple">Loyalty</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">TRACKED CUSTOMERS</div>
            <div className="stat-value">{overview?.customers?.totalUniqueTracked || 0}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">VIP Profiles: {customerData.topCustomers.length}</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-gold">
          <div className="stat-top">
            <div className="stat-icon-small bg-gold">
              <Layers size={18} />
            </div>
            <span className="badge badge-amber">{productData.categories.length} Categories</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">CATALOG VALUATION</div>
            <div className="stat-value">
              ₹{overview?.inventory?.inventoryRetailValue?.toLocaleString() || 0}
            </div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Cost Base: ₹{overview?.inventory?.inventoryCostValue?.toLocaleString() || 0}</div>
          </div>
        </div>
      </div>

      {/* ── Revenue & Profit Trend with Interval Tabs ──────────────────────── */}
      <div className="card fade-up" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <BarChart3 size={18} color="#60a5fa" /> Financial Velocity & Trend Aggregation
            </span>
            <p className="card-subtitle">Select date grouping interval to inspect historical performance</p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['daily', 'weekly', 'monthly', 'yearly'].map((int) => (
              <button
                key={int}
                className={`btn btn-sm ${interval === int ? 'btn-primary' : 'btn-ghost'}`}
                style={{ textTransform: 'capitalize', padding: '6px 14px' }}
                onClick={() => setInterval(int)}
              >
                {int}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          {trendData.data.length === 0 ? (
            <div className="empty-state">
              <p>No financial data points recorded for this range.</p>
            </div>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData.data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="areaRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="areaPro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#60a5fa"
                    strokeWidth={2.5}
                    fill="url(#areaRev)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    fill="url(#areaPro)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Product Performance & Peak Hourly Distribution ────────────────── */}
      <div className="grid-2 fade-up" style={{ marginBottom: '24px' }}>
        {/* Top Selling Products */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Award size={17} color="#fbbf24" /> Product Sales Velocity (Top Performers)
            </span>
          </div>
          <div className="table-wrap">
            {productData.topSellingProducts.length === 0 ? (
              <div className="empty-state">
                <p>No completed order products recorded.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {productData.topSellingProducts.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.productName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SKU: {p.sku || 'N/A'}</div>
                      </td>
                      <td style={{ fontWeight: 600, color: '#38bdf8' }}>{p.totalQuantitySold} pcs</td>
                      <td style={{ fontWeight: 700, color: '#34d399' }}>₹{p.totalRevenue?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Peak Hourly Order Traffic */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Clock size={17} color="#a855f7" /> 24-Hour Peak Ordering Distribution
            </span>
          </div>
          <div className="card-body">
            {orderData.byHourOfDay.length === 0 ? (
              <div className="empty-state">
                <p>No hourly order distribution data.</p>
              </div>
            ) : (
              <div className="chart-wrap" style={{ height: '260px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderData.byHourOfDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="count" name="Orders Count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Category Breakdown & Customer Lifetime Value ────────────────────── */}
      <div className="grid-2 fade-up">
        {/* Category Breakdown */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Layers size={17} color="#38bdf8" /> Category Inventory & Valuation Share
            </span>
          </div>
          <div className="table-wrap">
            {productData.categories.length === 0 ? (
              <div className="empty-state">
                <p>No categories found in catalog.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>SKUs</th>
                    <th>Total Units</th>
                    <th>Est. Value</th>
                  </tr>
                </thead>
                <tbody>
                  {productData.categories.map((c) => (
                    <tr key={c.category}>
                      <td style={{ fontWeight: 600, color: '#f8fafc' }}>{c.category}</td>
                      <td>{c.productCount}</td>
                      <td style={{ color: '#94a3b8' }}>{c.totalStock} units</td>
                      <td style={{ fontWeight: 700, color: '#fbbf24' }}>
                        ₹{c.inventoryValue?.toLocaleString() || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Customer Lifetime Spend & Loyalty */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Users size={17} color="#ec4899" /> VIP Customers & Lifetime Value
            </span>
          </div>
          <div className="table-wrap">
            {customerData.topCustomers.length === 0 ? (
              <div className="empty-state">
                <p>No registered customer transactions found.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Orders</th>
                    <th>Lifetime Spend</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {customerData.topCustomers.map((cust, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{cust.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cust.phone || cust.email || '—'}</div>
                      </td>
                      <td>
                        <span className="badge badge-purple">{cust.totalOrders} orders</span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#34d399' }}>₹{cust.totalSpend?.toLocaleString()}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {cust.lastOrderDate ? new Date(cust.lastOrderDate).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
