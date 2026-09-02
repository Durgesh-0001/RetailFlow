import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Activity, Database, Zap, Mail, Server } from 'lucide-react';

export default function SystemHealthBadge() {
  const [health, setHealth] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchHealth = async () => {
    try {
      const { data } = await api.get('/health');
      setHealth(data);
    } catch {
      setHealth({ success: false, services: { mongodb: 'offline', redis: 'offline', kafkaProducer: 'offline' } });
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // 30s heartbeat
    return () => clearInterval(interval);
  }, []);

  const isAllHealthy = health?.success && health?.services?.mongodb === 'connected';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="health-pill-group"
        style={{ cursor: 'pointer', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border)' }}
        title="Click to view backend service status"
      >
        <span className={`health-dot ${isAllHealthy ? 'active' : 'warning'}`} />
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
          {isAllHealthy ? 'v2 Engine Online' : 'Services Degraded'}
        </span>
      </button>

      {showDetails && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            width: '260px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid var(--border-hover)',
            borderRadius: '12px',
            padding: '14px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            zIndex: 150,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
            Backend v2 Cluster Health
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Database size={13} color="#38bdf8" /> MongoDB
              </span>
              <span className={`badge ${health?.services?.mongodb === 'connected' ? 'badge-emerald' : 'badge-rose'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {health?.services?.mongodb || 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Zap size={13} color="#a855f7" /> Redis Cache
              </span>
              <span className={`badge ${health?.services?.redis === 'healthy' ? 'badge-emerald' : 'badge-amber'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {health?.services?.redis || 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Server size={13} color="#f59e0b" /> Kafka Event Stream
              </span>
              <span className={`badge ${health?.services?.kafkaProducer === 'connected' ? 'badge-emerald' : 'badge-amber'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                {health?.services?.kafkaProducer || 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Mail size={13} color="#ec4899" /> Email Dispatcher
              </span>
              <span className="badge badge-emerald" style={{ padding: '2px 8px', fontSize: '10px' }}>
                {health?.services?.emailNotifications || 'Active'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
