import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const typeIcon = { success: '✅', error: '🚨', warning: '⚠️', info: 'ℹ️' }

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { data: notifs, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/api/dashboard/notifications').then(r => r.data),
  })

  const markRead = async (id) => {
    await api.put(`/api/dashboard/notifications/${id}/read`)
    qc.invalidateQueries(['notifications'])
  }

  if (isLoading) return <div className="loading-page"><div className="spinner spinner-dark"/></div>

  return (
    <div className="page-content" style={{ maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 20 }}>Notifications</h2>

      {!notifs?.length ? (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>🔔</div>
            <h3>No notifications</h3>
            <p>You're all caught up!</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifs.map(n => (
            <div key={n.id} className="card card-pad"
              style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: n.is_read ? 0.65 : 1, cursor: n.is_read ? 'default' : 'pointer', transition: 'opacity 0.2s' }}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div style={{ fontSize: 24, flexShrink: 0 }}>{typeIcon[n.type] || 'ℹ️'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{n.title}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{n.message}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                </div>
              </div>
              {!n.is_read && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
