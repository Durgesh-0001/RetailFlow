import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    shopName: '',
    ownerName: '',
    email: '',
    password: '',
    phone: '',
    address: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      toast.success('Shop registered! Welcome to RetailFlow v2 🎉');
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Registration failed. Please check your details.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Store size={24} color="#fff" />
          </div>
          <h1>
            Retail<span>Flow v2</span>
          </h1>
        </div>
        <h2>Register Your Shop</h2>
        <p>Set up your shop in seconds with the v2 event-driven architecture</p>

        {error && (
          <div
            style={{
              background: 'rgba(244,63,94,0.12)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: '12px',
              padding: '12px 16px',
              color: '#fda4af',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Shop / Business Name *</label>
              <input
                name="shopName"
                className="form-input"
                placeholder="e.g. Apex Supermarket"
                value={form.shopName}
                onChange={onChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Owner Name *</label>
              <input
                name="ownerName"
                className="form-input"
                placeholder="e.g. Rahul Sharma"
                value={form.ownerName}
                onChange={onChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email Address *</label>
            <input
              name="email"
              type="email"
              className="form-input"
              placeholder="owner@apexsupermarket.com"
              value={form.email}
              onChange={onChange}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Password *</label>
              <input
                name="password"
                type="password"
                className="form-input"
                placeholder="Min 6 characters"
                value={form.password}
                onChange={onChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input
                name="phone"
                className="form-input"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={onChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Store Address</label>
            <input
              name="address"
              className="form-input"
              placeholder="e.g. Sector 18, Commercial Belt"
              value={form.address}
              onChange={onChange}
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: '10px' }}
          >
            {loading ? <span className="spinner" /> : 'Create Shop Account'}
          </button>
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '13.5px',
            color: 'var(--text-secondary)',
          }}
        >
          Already registered?{' '}
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
