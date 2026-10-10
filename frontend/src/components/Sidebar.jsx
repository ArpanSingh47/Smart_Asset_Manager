import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { toast } from 'react-hot-toast'

const icons = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  request: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>,
  assets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  scan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10"/></svg>,
  venues: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
  requests: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  ai: <img src="/sammy.png" alt="Sammy" style={{ width: 18, height: 18, objectFit: 'contain' }} />,
  notifications: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  myreq: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>,
}

export default function Sidebar({ role }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Logged out')
    navigate('/login')
  }

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Dashboard', icon: icons.dashboard },
    { to: '/admin/requests', label: 'Requests', icon: icons.requests },
    { to: '/admin/scan', label: 'QR Scanner', icon: icons.scan },
    { to: '/admin/assets', label: 'Assets', icon: icons.assets },
    { to: '/admin/venues', label: 'Venues', icon: icons.venues },
  ]

  const userLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
    { to: '/new-request', label: 'New Request', icon: icons.request },
    { to: '/my-requests', label: 'My Requests', icon: icons.myreq },
    { to: '/notifications', label: 'Notifications', icon: icons.notifications },
  ]

  const links = role === 'admin' ? adminLinks : userLinks

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-brand">
          <img src="/logo.png" alt="Smart Asset Manager" className="sidebar-logo-img" />
          <h1 className="sidebar-brand-title">Smart Asset<br />Manager</h1>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Navigation</div>
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">
            {(user?.name ? user.name.replace(/\s*\([^)]*\)/g, '').trim() : 'U').charAt(0).toUpperCase()}
          </div>
          <div className="user-info">
            <div className="user-name" title={user?.name ? user.name.replace(/\s*\([^)]*\)/g, '').trim() : 'User'}>
              {user?.name ? user.name.replace(/\s*\([^)]*\)/g, '').trim() : 'User'}
            </div>
            <div className="user-role">
              {role === 'admin' ? 'Admin (Store Manager)' : (role || 'User')}
            </div>
          </div>
        </div>
        <button className="nav-item" style={{ width: '100%', marginTop: 8, background: 'rgba(220,38,38,0.1)', color: '#fca5a5', border: 'none' }} onClick={handleLogout}>
          {icons.logout} Logout
        </button>
      </div>
    </aside>
  )
}
