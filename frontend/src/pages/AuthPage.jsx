import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,12 2,6"/>
  </svg>
)

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const SAMIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28" color="white">
    <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
    <path d="M8 12h.01M12 12h.01M16 12h.01"/>
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
)

export default function AuthPage() {
  const [tab, setTab] = useState('login')
  const [step, setStep] = useState(1) // 1=form, 2=otp
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)

  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [regData, setRegData] = useState({ name: '', email: '', password: '', department: '', phone: '' })
  const [otp, setOtp] = useState('')

  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/api/auth/login', loginData)
      localStorage.setItem('token', data.access_token)
      setAuth(data.access_token, { name: data.name, role: data.role, id: data.id })
      toast.success(`Welcome back, ${data.name}!`)
      navigate(data.role === 'admin' ? '/admin/dashboard' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/api/auth/register', regData)
      setPendingEmail(regData.email)
      if (data.dev_otp) {
        setOtp(data.dev_otp)
      }
      setStep(2)
      toast.success(data.dev_otp ? `OTP generated: ${data.dev_otp}` : 'OTP sent to your email!')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally { setLoading(false) }
  }

  const handleOTP = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/api/auth/verify-otp', { email: pendingEmail, otp })
      localStorage.setItem('token', data.access_token)
      setAuth(data.access_token, { name: data.name, role: data.role })
      toast.success('Email verified! Welcome!')
      navigate(data.role === 'admin' ? '/admin/dashboard' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid OTP')
    } finally { setLoading(false) }
  }

  const resendOTP = async () => {
    try {
      const { data } = await api.post('/api/auth/resend-otp', { email: pendingEmail })
      if (data.dev_otp) setOtp(data.dev_otp)
      toast.success(data.dev_otp ? `New OTP: ${data.dev_otp}` : 'OTP resent!')
    } catch { toast.error('Failed to resend') }
  }

  const fillCredentials = (email, password) => {
    setLoginData({ email, password })
    setError('')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/logo.png" alt="Smart Asset Manager" className="auth-logo-img" />
          <h1>Smart Asset Manager</h1>
        </div>

        {step === 2 ? (
          <form onSubmit={handleOTP}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ margin: '0 auto 12px', width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <EmailIcon />
              </div>
              <h3 style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>Verify your email</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                We sent a 6-digit OTP to <strong>{pendingEmail}</strong>
              </p>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label className="form-label required">Enter OTP</label>
              <input
                className="form-input" style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
                maxLength={6} value={otp} onChange={e => setOtp(e.target.value)}
                placeholder="000000" required
              />
            </div>
            <button className="btn btn-primary w-full btn-lg" disabled={loading}>
              {loading ? <><span className="spinner"/> Verifying...</> : 'Verify OTP'}
            </button>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              Didn't receive?{' '}
              <button type="button" onClick={resendOTP} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Resend OTP
              </button>
            </p>
          </form>
        ) : (
          <>
            <div className="auth-tabs">
              <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError('') }}>Login</button>
              <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError('') }}>Register</button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {tab === 'login' ? (
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label required">Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><EmailIcon /></span>
                    <input className="form-input" style={{ paddingLeft: 42 }} type="email" placeholder="you@university.com"
                      value={loginData.email} onChange={e => setLoginData({ ...loginData, email: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><LockIcon /></span>
                    <input className="form-input" style={{ paddingLeft: 42, paddingRight: 42 }} type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                      value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} required />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary w-full btn-lg" style={{ marginTop: 8 }} disabled={loading}>
                  {loading ? <><span className="spinner"/> Logging in...</> : 'Login'}
                </button>

                <div className="auth-demo-box">
                  <div className="auth-demo-title">
                    Quick Demo Login
                  </div>
                  <div className="auth-demo-grid">
                    <button
                      type="button"
                      className="auth-demo-btn"
                      onClick={() => fillCredentials('admin@smartasset.edu', 'Admin@123')}
                    >
                      Store Admin
                    </button>
                    <button
                      type="button"
                      className="auth-demo-btn"
                      onClick={() => fillCredentials('faculty@smartasset.edu', 'User@123')}
                    >
                      Faculty User
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label className="form-label required">Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><UserIcon /></span>
                    <input className="form-input" style={{ paddingLeft: 42 }} placeholder="John Smith"
                      value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label required">Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><EmailIcon /></span>
                    <input className="form-input" style={{ paddingLeft: 42 }} type="email" placeholder="you@university.com"
                      value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input className="form-input" placeholder="e.g. Computer Science"
                      value={regData.department} onChange={e => setRegData({ ...regData, department: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" placeholder="+91 98765 43210"
                      value={regData.phone} onChange={e => setRegData({ ...regData, phone: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><LockIcon /></span>
                    <input className="form-input" style={{ paddingLeft: 42, paddingRight: 42 }} type={showRegPassword ? 'text' : 'password'} placeholder="Min. 8 characters"
                      value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} required minLength={8} />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(p => !p)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      title={showRegPassword ? "Hide password" : "Show password"}
                      aria-label={showRegPassword ? "Hide password" : "Show password"}
                    >
                      {showRegPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary w-full btn-lg" style={{ marginTop: 8 }} disabled={loading}>
                  {loading ? <><span className="spinner"/> Creating account...</> : 'Create Account'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
