import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, Mail, Lock, AlertCircle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back to RetailFlow!');
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Invalid email or password. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Store size={24} color="#fff" />
          </div>
          <h1>
            Retail<span>Flow v2</span>
          </h1>
        </div>
        <h2>Welcome Back</h2>
        <p>Sign in to your shop analytics & management dashboard</p>

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
          <div className="form-group">
            <label>Email Address</label>
            <input
              name="email"
              type="email"
              className="form-input"
              placeholder="owner@retailflow.io"
              value={form.email}
              onChange={onChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              name="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: '10px' }}
          >
            {loading ? <span className="spinner" /> : 'Sign In to Dashboard'}
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
          New store owner?{' '}
          <Link to="/register" className="auth-link">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
