import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import {
  Plus,
  X,
  TrendingUp,
  DollarSign,
  PieChart,
  Percent,
  Calendar,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function Finance() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    totalCOGS: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [sales, setSales] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    revenue: '',
    costOfGoodsSold: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadFinance = async () => {
    setLoading(true);
    try {
      const monthStr = String(month).padStart(2, '0');
      const [monthlyRes, salesRes] = await Promise.all([
        api.get('/sales/monthly', { params: { month, year } }),
        api.get('/sales', {
          params: {
            from: `${year}-${monthStr}-01`,
            to: `${year}-${monthStr}-31`,
          },
        }),
      ]);

      setSummary(monthlyRes.data.totals || { totalRevenue: 0, totalProfit: 0, totalCOGS: 0 });
      setChartData(
        (monthlyRes.data.dailyBreakdown || []).map((d) => ({
          date: d._id.slice(8),
          Revenue: d.revenue,
          Profit: d.profit,
          COGS: d.costOfGoodsSold,
        }))
      );
      setSales(salesRes.data.data || []);
    } catch (err) {
      console.error('Failed to load finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, [month, year]);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/sales', {
        revenue: Number(form.revenue),
        costOfGoodsSold: Number(form.costOfGoodsSold) || 0,
        date: form.date,
        notes: form.notes,
      });
      toast.success('Sale transaction recorded!');
      setModal(false);
      setForm({
        revenue: '',
        costOfGoodsSold: '',
        date: new Date().toISOString().slice(0, 10),
        notes: '',
      });
      loadFinance();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error recording sale.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSale = async (id) => {
    if (!window.confirm('Delete this ledger entry?')) return;
    try {
      await api.delete(`/sales/${id}`);
      toast.success('Sale record deleted.');
      loadFinance();
    } catch {
      toast.error('Could not delete sale record.');
    }
  };

  const margin =
    summary.totalRevenue > 0
      ? Math.round((summary.totalProfit / summary.totalRevenue) * 1000) / 10
      : 0;

  return (
    <Layout
      title="Finance & Sales Ledger"
      subtitle="Examine daily revenues, cost of goods, net margins, and manual sale journals"
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
          <Plus size={14} /> Log Manual Sale
        </button>
      }
    >
      {/* ── Period Selector ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={16} color="var(--text-muted)" />
          <select
            className="form-input"
            style={{ width: '140px', padding: '8px 12px' }}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <select
          className="form-input"
          style={{ width: '100px', padding: '8px 12px' }}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* ── Summary Stats ────────────────────────────────────────────────── */}
      <div className="stats-grid-v2 fade-up">
        <div className="stat-card-v2 stat-blue">
          <div className="stat-top">
            <div className="stat-icon-small bg-blue">
              <TrendingUp size={18} />
            </div>
            <span className="badge badge-indigo">
              {MONTHS[month - 1]} {year}
            </span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">MONTHLY REVENUE</div>
            <div className="stat-value">₹{summary.totalRevenue?.toLocaleString()}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">From orders & journals</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-green">
          <div className="stat-top">
            <div className="stat-icon-small bg-green">
              <DollarSign size={18} />
            </div>
            <span className="badge badge-emerald">Net Income</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">NET PROFIT</div>
            <div className="stat-value">₹{summary.totalProfit?.toLocaleString()}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">After deducting COGS</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-gold">
          <div className="stat-top">
            <div className="stat-icon-small bg-gold">
              <PieChart size={18} />
            </div>
            <span className="badge badge-amber">Cost Base</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">TOTAL COGS</div>
            <div className="stat-value">₹{summary.totalCOGS?.toLocaleString()}</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Cost of goods sold</div>
          </div>
        </div>

        <div className="stat-card-v2 stat-purple">
          <div className="stat-top">
            <div className="stat-icon-small bg-purple">
              <Percent size={18} />
            </div>
            <span className="badge badge-purple">Efficiency</span>
          </div>
          <div className="stat-mid">
            <div className="stat-title">PROFIT MARGIN</div>
            <div className="stat-value">{margin}%</div>
          </div>
          <div className="stat-bot">
            <div className="stat-sub">Margin performance</div>
          </div>
        </div>
      </div>

      {/* ── Daily Breakdown Bar Chart ─────────────────────────────────────── */}
      <div className="card fade-up" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">Daily Revenue, Profit & COGS Breakdown</span>
        </div>
        <div className="card-body">
          {chartData.length === 0 ? (
            <div className="empty-state">
              <p>No sales activity logged for {MONTHS[month - 1]} {year}.</p>
            </div>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
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
                  <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                  <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="COGS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Sales Ledger Table ────────────────────────────────────────────── */}
      <div className="card fade-up">
        <div className="card-header">
          <span className="card-title">Transaction Ledger</span>
        </div>
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">
              <div className="spinner" />
            </div>
          ) : sales.length === 0 ? (
            <div className="empty-state">
              <p>No sales records found for this period.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source / Order</th>
                  <th>Revenue</th>
                  <th>COGS</th>
                  <th>Net Profit</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s._id}>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(s.date).toLocaleDateString('en-IN')}
                    </td>
                    <td>
                      <span className={`badge ${s.order ? 'badge-indigo' : 'badge-cyan'}`}>
                        {s.order?.orderNumber || 'Manual Journal'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#60a5fa' }}>
                      ₹{s.revenue?.toLocaleString()}
                    </td>
                    <td style={{ color: '#fbbf24' }}>
                      ₹{s.costOfGoodsSold?.toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 700, color: '#34d399' }}>
                      ₹{s.profit?.toLocaleString()}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {s.notes || '—'}
                    </td>
                    <td>
                      {!s.order && (
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          title="Delete Manual Sale"
                          onClick={() => deleteSale(s._id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Manual Sale Modal ─────────────────────────────────────────────── */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Record Manual Sale</h3>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={onSave}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Revenue Amount (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.revenue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, revenue: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Cost of Goods (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.costOfGoodsSold}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          costOfGoodsSold: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Transaction Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description / Notes</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Offline wholesale batch"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: 'auto' }}
                  disabled={saving}
                >
                  {saving ? <span className="spinner" /> : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
