import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'

const statusConfig = {
  pending: { icon: '⏳', color: 'var(--warning)' },
  approved: { icon: '✅', color: 'var(--success)' },
  partially_approved: { icon: '⚠️', color: 'var(--warning)' },
  rejected: { icon: '❌', color: 'var(--error)' },
  completed: { icon: '🏁', color: '#4f46e5' },
}

export default function MyRequests() {
  const { data: requests, isLoading } = useQuery({
    queryKey: ['my-requests'],
    queryFn: () => api.get('/api/requests/my').then(r => r.data),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner spinner-dark"/></div>

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontWeight: 700, fontSize: 22 }}>My Requests</h2>
        <Link to="/new-request" className="btn btn-primary">+ New Request</Link>
      </div>

      {!requests?.length ? (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 56, marginBottom: 12 }}>📋</div>
            <h3>No requests yet</h3>
            <p>Submit your first asset request to get started</p>
            <Link to="/new-request" className="btn btn-primary" style={{ marginTop: 16 }}>+ New Request</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {requests.map(r => {
            const cfg = statusConfig[r.status] || statusConfig.pending
            return (
              <div key={r.id} className="card card-pad" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, border: '1px solid var(--border)' }}>
                  {cfg.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{r.event_name}</h3>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span>
                        {r.venue && <span className="badge badge-info">🏛️ {r.venue.name}</span>}
                        <span className="badge badge-pending">📅 {r.event_date ? new Date(r.event_date).toLocaleDateString() : '—'}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                      <div>#{r.id}</div>
                      <div>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {r.items?.map(item => (
                      <span key={item.id} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {item.quantity_requested}× {item.item_name}
                        {item.is_other && ' ✏️'}
                      </span>
                    ))}
                  </div>
                  {r.admin_notes && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, borderLeft: `3px solid ${cfg.color}` }}>
                      <strong>Admin note:</strong> {r.admin_notes}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
