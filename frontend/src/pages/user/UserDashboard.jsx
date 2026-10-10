import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function UserDashboard() {
  const { user } = useAuthStore()
  const { data: stats } = useQuery({ queryKey: ['user-stats'], queryFn: () => api.get('/api/dashboard/user').then(r => r.data) })
  const { data: requests } = useQuery({ queryKey: ['my-requests'], queryFn: () => api.get('/api/requests/my').then(r => r.data) })

  const recent = requests?.slice(0, 3) || []

  return (
    <div className="page-content">
      {/* Welcome */}
      <div style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-light))', borderRadius: 'var(--radius-lg)', padding: '28px 32px', marginBottom: 24, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Welcome back, {user?.name?.split(' ')[0]}! 👋</h2>
          <p style={{ opacity: 0.8, fontSize: 15 }}>Manage your asset requests from one place.</p>
        </div>
        <Link to="/new-request" className="btn btn-accent btn-lg" style={{ flexShrink: 0 }}>+ New Request</Link>
      </div>

      {/* Stats */}
      <div className="stat-grid mb-6">
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div className="stat-info"><div className="stat-value">{stats?.total_requests || 0}</div><div className="stat-label">Total Requests</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">⏳</div>
          <div className="stat-info"><div className="stat-value">{stats?.pending || 0}</div><div className="stat-label">Pending</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div className="stat-info"><div className="stat-value">{stats?.approved || 0}</div><div className="stat-label">Approved</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">🏁</div>
          <div className="stat-info"><div className="stat-value">{stats?.completed || 0}</div><div className="stat-label">Completed</div></div>
        </div>
      </div>

      {/* Recent */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Requests</span>
          <Link to="/my-requests" className="btn btn-outline btn-sm">View All</Link>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {recent.length ? recent.map(r => (
            <div key={r.id} style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.event_name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.event_date ? new Date(r.event_date).toLocaleDateString() : ''} · {r.items?.length} item(s)</div>
              </div>
              <span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span>
            </div>
          )) : (
            <div className="empty-state">
              <p>No requests yet. <Link to="/new-request" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create one →</Link></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
