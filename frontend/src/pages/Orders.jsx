import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import {
  Plus,
  X,
  ShoppingCart,
  Eye,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mail,
  Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CLASSES = {
  Pending: 'badge-amber',
  Processing: 'badge-indigo',
  Completed: 'badge-emerald',
  Cancelled: 'badge-rose',
};
const STATUS_OPTIONS = ['Pending', 'Processing', 'Completed', 'Cancelled'];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    discount: 0,
    status: 'Completed',
    notes: '',
  });

  const [items, setItems] = useState([{ product: '', quantity: 1 }]);

  const loadData = async () => {
    try {
      const params = filter ? { status: filter } : {};
      const [ordRes, prodRes] = await Promise.all([
        api.get('/orders', { params }),
        api.get('/products'),
      ]);
      setOrders(ordRes.data.data);
      setProducts(prodRes.data.data.filter((p) => p.quantity > 0));
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const addItem = () =>
    setItems((curr) => [...curr, { product: '', quantity: 1 }]);

  const removeItem = (idx) =>
    setItems((curr) => curr.filter((_, i) => i !== idx));

  const updateItem = (idx, field, val) =>
    setItems((curr) =>
      curr.map((it, i) => (i === idx ? { ...it, [field]: val } : it))
    );

  // Calculate live subtotal
  const computedSubtotal = items.reduce((acc, it) => {
    const p = products.find((prod) => prod._id === it.product);
    return acc + (p ? p.sellingPrice * (Number(it.quantity) || 1) : 0);
  }, 0);

  const computedFinal = Math.max(0, computedSubtotal - (Number(form.discount) || 0));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/orders', {
        customer: {
          name: form.customerName || 'Walk-in Customer',
          email: form.customerEmail || undefined,
          phone: form.customerPhone || undefined,
        },
        items: items.map((i) => ({
          product: i.product,
          quantity: Number(i.quantity),
        })),
        discount: Number(form.discount) || 0,
        status: form.status,
        notes: form.notes,
      });

      toast.success(
        form.customerEmail
          ? 'Order created & invoice queued for email!'
          : 'Order created successfully!'
      );
      setModal(false);
      setForm({
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        discount: 0,
        status: 'Completed',
        notes: '',
      });
      setItems([{ product: '', quantity: 1 }]);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/orders/${id}/status`, { status });
      toast.success(`Order marked as ${status}`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed.');
    }
  };

  const deleteOrder = async (id, orderNumber) => {
    if (
      !window.confirm(
        `Are you sure you want to delete order "${orderNumber}"? Stock will be restored.`
      )
    )
      return;
    try {
      await api.delete(`/orders/${id}`);
      toast.success('Order removed & stock restored.');
      loadData();
    } catch {
      toast.error('Failed to delete order.');
    }
  };

  return (
    <Layout
      title="Orders & Invoicing"
      subtitle="Fulfill customer orders, trigger Kafka email invoices, and track lifecycles"
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
          <Plus size={14} /> New Order
        </button>
      }
    >
      {/* ── Filter Tabs ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['', ...STATUS_OPTIONS].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto', padding: '6px 16px' }}
            onClick={() => setFilter(s)}
          >
            {s || 'All Orders'}
          </button>
        ))}
      </div>

      {/* ── Order Table ──────────────────────────────────────────────────── */}
      <div className="card fade-up">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">
              <div className="spinner" />
            </div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={40} />
              <p>No orders matching filter.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Subtotal</th>
                  <th>Discount</th>
                  <th>Final</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td
                      style={{
                        fontWeight: 700,
                        color: '#818cf8',
                        fontFamily: 'monospace',
                      }}
                    >
                      {o.orderNumber}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {o.customer?.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {o.customer?.email ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Mail size={10} /> {o.customer.email}
                          </span>
                        ) : (
                          o.customer?.phone || '—'
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {o.items?.length || 1} item(s)
                    </td>
                    <td>₹{o.totalAmount?.toLocaleString()}</td>
                    <td style={{ color: 'var(--rose)' }}>-₹{o.discount || 0}</td>
                    <td style={{ fontWeight: 700, color: '#34d399' }}>
                      ₹{o.finalAmount?.toLocaleString()}
                    </td>
                    <td>
                      <select
                        value={o.status}
                        onChange={(e) => changeStatus(o._id, e.target.value)}
                        style={{
                          background: 'rgba(15, 23, 42, 0.9)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: '#f8fafc',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        {STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(o.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          title="View Invoice"
                          onClick={() => setViewOrder(o)}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          title="Delete Order"
                          onClick={() => deleteOrder(o._id, o.orderNumber)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Create Order Modal ────────────────────────────────────────────── */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h3>Create Customer Order</h3>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={onSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Customer Name</label>
                    <input
                      className="form-input"
                      placeholder="Walk-in Customer"
                      value={form.customerName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customerName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Customer Email (Auto Invoice)</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="customer@email.com"
                      value={form.customerEmail}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customerEmail: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Customer Phone</label>
                    <input
                      className="form-input"
                      placeholder="+91 98765 43210"
                      value={form.customerPhone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customerPhone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Initial Status</label>
                    <select
                      className="form-input"
                      value={form.status}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, status: e.target.value }))
                      }
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Items Selector */}
                <label
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '10px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Order Line Items *
                </label>
                {items.map((item, idx) => {
                  const selProd = products.find((p) => p._id === item.product);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '8px',
                        alignItems: 'center',
                      }}
                    >
                      <select
                        className="form-input"
                        style={{ flex: 2 }}
                        value={item.product}
                        onChange={(e) => updateItem(idx, 'product', e.target.value)}
                        required
                      >
                        <option value="">Select product from stock...</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} — ₹{p.sellingPrice} (Stock: {p.quantity})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        max={selProd ? selProd.quantity : 9999}
                        className="form-input"
                        style={{ width: '85px' }}
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        required
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-icon btn-sm"
                          onClick={() => removeItem(idx)}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={addItem}
                  style={{ marginBottom: '16px' }}
                >
                  <Plus size={13} /> Add Another Item
                </button>

                <div className="form-row">
                  <div className="form-group">
                    <label>Discount Amount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.discount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, discount: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Order Notes</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Expedited delivery"
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Calculation Summary Box */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    marginTop: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Subtotal: ₹{computedSubtotal.toLocaleString()} • Discount: ₹
                      {form.discount || 0}
                    </div>
                    <div style={{ fontSize: '11px', color: '#a855f7', marginTop: '2px' }}>
                      Kafka notification will broadcast on submit
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Final Total
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399' }}>
                      ₹{computedFinal.toLocaleString()}
                    </div>
                  </div>
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
                  {saving ? <span className="spinner" /> : 'Confirm Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Order Details / Invoice Modal ─────────────────────────────── */}
      {viewOrder && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setViewOrder(null)}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={20} color="#818cf8" />
                <h3>Receipt — {viewOrder.orderNumber}</h3>
              </div>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setViewOrder(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Customer</div>
                  <div style={{ fontWeight: 600, color: '#fff' }}>
                    {viewOrder.customer?.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {viewOrder.customer?.email || viewOrder.customer?.phone || 'No contact provided'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Status</div>
                  <div>
                    <span className={`badge ${STATUS_CLASSES[viewOrder.status]}`}>
                      {viewOrder.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {new Date(viewOrder.createdAt).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  padding: '12px 0',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Purchased Items
                </div>
                {viewOrder.items?.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      marginBottom: '6px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{it.productName}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                        x{it.quantity}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600 }}>₹{it.subtotal?.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Gross Total</span>
                  <span>₹{viewOrder.totalAmount?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--rose)' }}>
                  <span>Discount Applied</span>
                  <span>-₹{viewOrder.discount || 0}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 800,
                    fontSize: '16px',
                    color: '#34d399',
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span>Final Charged</span>
                  <span>₹{viewOrder.finalAmount?.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setViewOrder(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
