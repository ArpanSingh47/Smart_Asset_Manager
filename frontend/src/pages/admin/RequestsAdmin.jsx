import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

export default function RequestsAdmin() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [approval, setApproval] = useState({ status: 'approved', admin_notes: '', items: [] })
  const [loading, setLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-requests', statusFilter],
    queryFn: () => api.get(`/api/requests/all?status=${statusFilter}`).then(r => r.data),
  })

  const openReview = async (reqId) => {
    const { data } = await api.get(`/api/requests/${reqId}`)
    setSelected(data)
    setApproval({
      status: 'approved',
      admin_notes: '',
      items: data.items.map(i => ({ request_item_id: i.id, quantity_approved: i.quantity_requested }))
    })
  }

  const handleApprove = async () => {
    setLoading(true)
    try {
      await api.put(`/api/requests/${selected.id}/review`, approval)
      toast.success(`Request ${approval.status}!`)
      setSelected(null)
      qc.invalidateQueries(['admin-requests'])
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    finally { setLoading(false) }
  }

  const updateItemQty = (id, qty) => {
    setApproval(a => ({
      ...a,
      items: a.items.map(i => i.request_item_id === id ? { ...i, quantity_approved: qty } : i)
    }))
  }

  if (isLoading) return <div className="loading-page"><div className="spinner spinner-dark"/></div>

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontWeight: 700, fontSize: 22 }}>Asset Requests</h2>
        <div className="auth-tabs" style={{ margin: 0, width: 'auto' }}>
          {['pending', 'approved', 'rejected', ''].map(s => (
            <button key={s} className={`auth-tab ${statusFilter === s ? 'active' : ''}`}
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => setStatusFilter(s)}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Request</th><th>Event</th><th>User / Dept</th><th>Event Date</th><th>Items</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {data?.requests?.length ? data.requests.map(r => (
                <tr key={r.id}>
                  <td><strong>#{r.id}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.event_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.venue?.name}</div>
                  </td>
                  <td>
                    <div>{r.user?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.user?.department}</div>
                  </td>
                  <td className="text-sm">{r.event_date ? new Date(r.event_date).toLocaleDateString() : '—'}</td>
                  <td><span className="badge badge-info">{r.items?.length} item{r.items?.length !== 1 ? 's' : ''}</span></td>
                  <td><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => openReview(r.id)}>
                      {r.status === 'pending' ? '📋 Review' : '👁 View'}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7}><div className="empty-state"><p>No requests found</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-title">Request #{selected.id} — {selected.event_name}</span>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  By {selected.user?.name} ({selected.user?.department}) · {selected.event_date ? new Date(selected.event_date).toLocaleDateString() : ''}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Request Info */}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><span className="text-muted">Venue</span><div style={{ fontWeight: 600 }}>{selected.venue?.name || 'N/A'}</div></div>
                <div><span className="text-muted">Return By</span><div style={{ fontWeight: 600 }}>{selected.expected_return_date ? new Date(selected.expected_return_date).toLocaleDateString() : 'N/A'}</div></div>
                <div><span className="text-muted">Time</span><div style={{ fontWeight: 600 }}>{selected.event_start_time} – {selected.event_end_time}</div></div>
                <div><span className="text-muted">Purpose</span><div style={{ fontWeight: 600 }}>{selected.purpose || '—'}</div></div>
              </div>

              {/* Items */}
              <div className="form-group">
                <label className="form-label">Requested Items</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {selected.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.category}{item.notes ? ` · ${item.notes}` : ''}</div>
                        {item.is_other && <span className="badge badge-warning" style={{ fontSize: 10 }}>Custom item</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Requested: <strong>{item.quantity_requested}</strong></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13 }}>Approve:</span>
                        <input type="number" min={0} max={item.quantity_requested}
                          className="form-input" style={{ width: 70 }}
                          value={approval.items.find(i => i.request_item_id === item.id)?.quantity_approved ?? item.quantity_requested}
                          onChange={e => updateItemQty(item.id, parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selected.status === 'pending' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Decision</label>
                      <select className="form-select" value={approval.status} onChange={e => setApproval(a => ({ ...a, status: e.target.value }))}>
                        <option value="approved">✅ Approve</option>
                        <option value="partially_approved">⚠️ Partially Approve</option>
                        <option value="rejected">❌ Reject</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Admin Notes (sent to user)</label>
                    <textarea className="form-textarea" rows={2}
                      placeholder="Optional note for the requester..."
                      value={approval.admin_notes}
                      onChange={e => setApproval(a => ({ ...a, admin_notes: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>
            {selected.status === 'pending' && (
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setSelected(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleApprove} disabled={loading}>
                  {loading ? <span className="spinner" /> : 'Submit Decision'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
