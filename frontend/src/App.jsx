import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import Sidebar from './components/Sidebar'

import AuthPage from './pages/AuthPage'
import UserDashboard from './pages/user/UserDashboard'
import NewRequest from './pages/user/NewRequest'
import MyRequests from './pages/user/MyRequests'
import NotificationsPage from './pages/user/NotificationsPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import AssetsPage from './pages/admin/AssetsPage'
import QRScanner from './pages/admin/QRScanner'
import RequestsAdmin from './pages/admin/RequestsAdmin'
import VenuesAdmin from './pages/admin/VenuesAdmin'
import SammyAI from './pages/admin/SammyAI'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1 } } })

function ProtectedLayout({ role, children }) {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (role === 'user' && user.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return (
    <div className="app-layout">
      <Sidebar role={user.role} />
      <div className="main-content">
        {children}
      </div>
    </div>
  )
}

function PageWrapper({ title, subtitle, children }) {
  const { user } = useAuthStore()
  const sammyLink = user?.role === 'admin' ? '/admin/ai' : '/ai'

  return (
    <>
      <div className="top-bar">
        <div>
          <div className="page-title">{title}</div>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        <div className="top-bar-actions">
          <Link to={sammyLink} className="ask-sammy-btn" id="ask-sammy-btn" title="Ask Sammy AI Assistant">
            <div className="ask-sammy-avatar">
              <img src="/sammy.png" alt="Sammy" />
            </div>
            <span className="ask-sammy-text">Ask Sammy</span>
            <span className="ask-sammy-badge">AI</span>
          </Link>
        </div>
      </div>
      {children}
    </>
  )
}

export default function App() {
  const { user, token } = useAuthStore()

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style: { fontFamily: 'Inter, sans-serif', fontSize: 14, borderRadius: 10 },
          success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
          error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
        }} />
        <Routes>
          {/* Public */}
          <Route path="/login" element={token && user ? <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} /> : <AuthPage />} />
          <Route path="/" element={<Navigate to={token && user ? (user.role === 'admin' ? '/admin/dashboard' : '/dashboard') : '/login'} />} />

          {/* User Routes */}
          <Route path="/dashboard" element={
            <ProtectedLayout role="user">
              <PageWrapper title="Dashboard" subtitle="Welcome to Smart Asset Manager">
                <UserDashboard />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/new-request" element={
            <ProtectedLayout role="user">
              <PageWrapper title="New Request" subtitle="Submit an asset request for your event">
                <NewRequest />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/my-requests" element={
            <ProtectedLayout role="user">
              <PageWrapper title="My Requests" subtitle="Track all your asset requests">
                <MyRequests />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/notifications" element={
            <ProtectedLayout role="user">
              <PageWrapper title="Notifications">
                <NotificationsPage />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/ai" element={
            <ProtectedLayout role="user">
              <PageWrapper title="Sammy AI Assistant" subtitle="Ask anything about your assets and requests">
                <SammyAI />
              </PageWrapper>
            </ProtectedLayout>
          } />

          {/* Admin Routes */}
          <Route path="/admin/dashboard" element={
            <ProtectedLayout role="admin">
              <PageWrapper title="Admin Dashboard" subtitle="Smart Asset Manager Overview">
                <AdminDashboard />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/admin/requests" element={
            <ProtectedLayout role="admin">
              <PageWrapper title="Asset Requests" subtitle="Review and manage all requests">
                <RequestsAdmin />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/admin/scan" element={
            <ProtectedLayout role="admin">
              <PageWrapper title="QR Scanner" subtitle="Scan QR codes to allocate or return assets">
                <QRScanner />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/admin/assets" element={
            <ProtectedLayout role="admin">
              <PageWrapper title="Asset Inventory" subtitle="Manage all assets and generate QR labels">
                <AssetsPage />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/admin/venues" element={
            <ProtectedLayout role="admin">
              <PageWrapper title="Venues" subtitle="Manage university venues">
                <VenuesAdmin />
              </PageWrapper>
            </ProtectedLayout>
          } />
          <Route path="/admin/ai" element={
            <ProtectedLayout role="admin">
              <PageWrapper title="Sammy AI Assistant" subtitle="Ask anything about your asset inventory">
                <SammyAI />
              </PageWrapper>
            </ProtectedLayout>
          } />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
