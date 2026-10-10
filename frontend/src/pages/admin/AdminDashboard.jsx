import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { toast } from 'react-hot-toast'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#093d42', '#137782', '#c28b26', '#b83232', '#4b5563']

const ICONS = {
  box: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  check: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  activity: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  clock: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  alert: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  users: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  mail: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>,
}

export default function AdminDashboard() {
  const { user } = useAuthStore()
  const [sendingReminder, setSendingReminder] = useState(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/api/dashboard/admin').then(r => r.data),
    refetchInterval: 30000,
  })

  const sendReminder = async (allocId) => {
    setSendingReminder(allocId)
    try {
      await api.post('/api/allocations/send-reminder', { allocation_id: allocId })
      toast.success('Reminder sent!')
      refetch()
    } catch { toast.error('Failed to send reminder') }
    finally { setSendingReminder(null) }
  }

  if (isLoading) return <div className="loading-page"><div className="spinner spinner-dark"/><span>Loading dashboard...</span></div>

  const { assets, requests, allocations, users, category_breakdown, recent_requests, flagged_allocations } = data || {}

  const statusData = [
    { name: 'Available', value: assets?.available || 0 },
    { name: 'In Use', value: assets?.in_use || 0 },
    { name: 'Maintenance', value: assets?.maintenance || 0 },
    { name: 'Retired', value: assets?.retired || 0 },
  ]

  return (
    <div className="page-content">
      {flagged_allocations?.length > 0 && (
        <div className="flag-banner">
          <span style={{ color: 'var(--error)', display: 'flex', alignItems: 'center' }}>{ICONS.alert}</span>
          <div>
            <strong style={{ color: 'var(--error)' }}>{flagged_allocations.length} overdue allocation{flagged_allocations.length > 1 ? 's' : ''}!</strong>
            <p style={{ fontSize: 13, color: 'var(--error)', marginTop: 2 }}>Assets not returned after deadline. Please send reminders below.</p>
          </div>
        </div>
      )}

      {/* Stat Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon blue">{ICONS.box}</div>
          <div className="stat-info">
            <div className="stat-value">{assets?.total || 0}</div>
            <div className="stat-label">Total Assets</div>
            <div className="stat-sub">{assets?.available || 0} available</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">{ICONS.check}</div>
          <div className="stat-info">
            <div className="stat-value">{assets?.available || 0}</div>
            <div className="stat-label">Available</div>
            <div className="stat-sub">Ready to allocate</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">{ICONS.activity}</div>
          <div className="stat-info">
            <div className="stat-value">{assets?.in_use || 0}</div>
            <div className="stat-label">In Use</div>
            <div className="stat-sub">{allocations?.active || 0} active allocations</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">{ICONS.clock}</div>
          <div className="stat-info">
            <div className="stat-value">{requests?.pending || 0}</div>
            <div className="stat-label">Pending Requests</div>
            <div className="stat-sub">Need review</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">{ICONS.alert}</div>
          <div className="stat-info">
            <div className="stat-value">{allocations?.overdue || 0}</div>
            <div className="stat-label">Overdue</div>
            <div className="stat-sub">Past return deadline</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">{ICONS.users}</div>
          <div className="stat-info">
            <div className="stat-value">{users || 0}</div>
            <div className="stat-label">Registered Users</div>
            <div className="stat-sub">{requests?.total || 0} total requests</div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Category Chart */}
        <div className="card">
          <div className="card-header"><span className="card-title">Assets by Category</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={category_breakdown || []} barSize={32}>
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Pie */}
        <div className="card">
          <div className="card-header"><span className="card-title">Asset Status</span></div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {statusData.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{s.name}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Flagged Allocations */}
      {flagged_allocations?.length > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">🚨 Flagged — Overdue Allocations</span>
            <span className="badge badge-overdue">{flagged_allocations.length} items</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>User</th>
                  <th>Department</th>
                  <th>Due Date</th>
                  <th>Reminders Sent</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {flagged_allocations.map(a => (
                  <tr key={a.allocation_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.asset_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.asset_code}</div>
                    </td>
                    <td>
                      <div>{a.user_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.user_email}</div>
                    </td>
                    <td className="text-muted">—</td>
                    <td><span style={{ color: 'var(--error)', fontWeight: 600 }}>{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}</span></td>
                    <td><span className="badge badge-flagged">{a.reminder_count} sent</span></td>
                    <td>
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => sendReminder(a.allocation_id)}
                        disabled={sendingReminder === a.allocation_id}
                      >
                        {sendingReminder === a.allocation_id ? <span className="spinner" /> : ICONS.mail} Send Reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Requests */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Requests</span>
          <Link to="/admin/requests" className="btn btn-outline btn-sm">View All</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Event</th><th>Requested By</th><th>Status</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {recent_requests?.length ? recent_requests.map(r => (
                <tr key={r.id}>
                  <td><div style={{ fontWeight: 600 }}>{r.event_name}</div></td>
                  <td>{r.user_name}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td className="text-muted text-sm">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td><Link to={`/admin/requests/${r.id}`} className="btn btn-outline btn-sm">Review</Link></td>
                </tr>
              )) : (
                <tr><td colSpan={5}><div className="empty-state"><p>No recent requests</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
