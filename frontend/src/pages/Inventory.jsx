import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Package,
  ArrowUpDown,
  AlertTriangle,
  Minus,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  name: '',
  sku: '',
  category: '',
  unit: 'pcs',
  costPrice: '',
  sellingPrice: '',
  quantity: '',
  lowStockThreshold: 10,
  description: '',
};

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(null); // product object
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('Stock check adjustment');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', {
        params: search ? { search } : {},
      });
      setProducts(data.data);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (p) => {
    setEditing(p._id);
    setForm({ ...p });
    setModal(true);
  };

  const closeModal = () => {
    setModal(false);
    setAdjustModal(null);
  };

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/products/${editing}`, form);
        toast.success('Product updated successfully!');
      } else {
        await api.post('/products', form);
        toast.success('Product added to inventory!');
      }
      closeModal();
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id, name) => {
    if (!window.confirm(`Delete product "${name}" permanently?`)) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Product deleted.');
      loadProducts();
    } catch {
      toast.error('Could not delete product.');
    }
  };

  const onStockAdjust = async (e) => {
    e.preventDefault();
    if (!adjustModal || !adjustAmount) return;
    setSaving(true);
    try {
      await api.patch(`/products/${adjustModal._id}/stock`, {
        adjustment: Number(adjustAmount),
        reason: adjustReason,
      });
      toast.success('Inventory stock adjusted!');
      closeModal();
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Stock adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout
      title="Inventory Management"
      subtitle="Track SKUs, cost bases, real-time stock levels, and instant stock adjustments"
      actions={
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={14} /> Add Product
        </button>
      }
    >
      {/* ── Search and Filter Bar ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div className="search-wrap">
          <Search size={14} />
          <input
            className="search-input"
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {products.length} Products registered
        </span>
      </div>

      {/* ── Product Table ────────────────────────────────────────────────── */}
      <div className="card fade-up">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">
              <div className="spinner" />
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <Package size={40} />
              <p>No products found. Start by adding your first product!</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Cost Base</th>
                  <th>Retail Price</th>
                  <th>Margin %</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const margin =
                    p.sellingPrice > 0
                      ? Math.round(
                          ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100
                        )
                      : 0;

                  return (
                    <tr key={p._id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {p.unit}
                        </div>
                      </td>
                      <td
                        style={{
                          color: '#94a3b8',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                        }}
                      >
                        {p.sku || '—'}
                      </td>
                      <td>{p.category || 'General'}</td>
                      <td>₹{p.costPrice?.toLocaleString()}</td>
                      <td style={{ fontWeight: 600, color: '#fff' }}>
                        ₹{p.sellingPrice?.toLocaleString()}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            margin >= 30
                              ? 'badge-emerald'
                              : margin > 10
                              ? 'badge-indigo'
                              : 'badge-amber'
                          }`}
                        >
                          {margin}%
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        <span
                          style={{
                            color:
                              p.quantity === 0
                                ? 'var(--rose)'
                                : p.quantity <= p.lowStockThreshold
                                ? 'var(--amber)'
                                : 'var(--emerald)',
                          }}
                        >
                          {p.quantity} {p.unit}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            p.stockStatus === 'Sufficient'
                              ? 'badge-emerald'
                              : p.stockStatus === 'Short Stock'
                              ? 'badge-amber'
                              : 'badge-rose'
                          }`}
                        >
                          {p.stockStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Adjust Stock"
                            onClick={() => {
                              setAdjustModal(p);
                              setAdjustAmount('');
                            }}
                          >
                            <ArrowUpDown size={13} color="#38bdf8" />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Edit"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="btn btn-danger btn-icon btn-sm"
                            title="Delete"
                            onClick={() => onDelete(p._id, p.name)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Add / Edit Product Modal ─────────────────────────────────────── */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="modal">
            <div className="modal-header">
              <h3>{editing ? 'Edit Product SKU' : 'Add New Product'}</h3>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={closeModal}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={onSave}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Product Name *</label>
                    <input
                      name="name"
                      className="form-input"
                      value={form.name}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>SKU / Barcode</label>
                    <input
                      name="sku"
                      className="form-input"
                      value={form.sku}
                      onChange={onChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Category</label>
                    <input
                      name="category"
                      className="form-input"
                      placeholder="e.g. Beverages, Electronics"
                      value={form.category}
                      onChange={onChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      name="unit"
                      className="form-input"
                      placeholder="pcs, kg, packet"
                      value={form.unit}
                      onChange={onChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Cost Base (₹) *</label>
                    <input
                      name="costPrice"
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.costPrice}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Selling Price (₹) *</label>
                    <input
                      name="sellingPrice"
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.sellingPrice}
                      onChange={onChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Initial Stock Quantity *</label>
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.quantity}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Low Stock Warning Threshold</label>
                    <input
                      name="lowStockThreshold"
                      type="number"
                      min="0"
                      className="form-input"
                      value={form.lowStockThreshold}
                      onChange={onChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description / Notes</label>
                  <input
                    name="description"
                    className="form-input"
                    value={form.description}
                    onChange={onChange}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: 'auto' }}
                  disabled={saving}
                >
                  {saving ? (
                    <span className="spinner" />
                  ) : editing ? (
                    'Update Product'
                  ) : (
                    'Add Product'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Fast Stock Adjustment Modal ──────────────────────────────────── */}
      {adjustModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Adjust Stock — {adjustModal.name}</h3>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={closeModal}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={onStockAdjust}>
              <div className="modal-body">
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '16px',
                  }}
                >
                  Current Inventory: <b>{adjustModal.quantity}</b> {adjustModal.unit}
                </p>

                <div className="form-group">
                  <label>Stock Adjustment Quantity (+ to add, - to subtract)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 10 or -5"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Reason / Audit Note</label>
                  <input
                    className="form-input"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Restocked shipment #402"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: 'auto' }}
                  disabled={saving}
                >
                  {saving ? <span className="spinner" /> : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
