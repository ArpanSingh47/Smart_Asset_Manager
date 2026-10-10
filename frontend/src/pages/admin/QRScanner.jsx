import { useState, useEffect, useRef } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import api from '../../services/api'
import { toast } from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'

const CameraGraphic = ({ size = 28, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

const ScanGraphic = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
    <line x1="7" y1="12" x2="17" y2="12" strokeDasharray="2 2"/>
    <circle cx="12" cy="12" r="2" fill={color}/>
  </svg>
)

const AllocateGraphic = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7"/>
  </svg>
)

const ReturnGraphic = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>
)

const SearchGraphic = ({ size = 15, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

const PackageGraphic = ({ size = 26, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
)

const CheckGraphic = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export default function QRScanner() {
  const [mode, setMode] = useState('allocate') // allocate | return
  const [scanning, setScanning] = useState(false)
  const [scannedAsset, setScannedAsset] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [returnCondition, setReturnCondition] = useState('good')
  const [returnNotes, setReturnNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const scannerRef = useRef(null)

  const [manualCode, setManualCode] = useState('')

  const { data: approvedRequests } = useQuery({
    queryKey: ['approved-requests'],
    queryFn: () => api.get('/api/requests/all?status=approved').then(r => r.data),
    enabled: mode === 'allocate'
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const assetParam = params.get('asset')
    if (assetParam) {
      lookupAsset(assetParam)
    }
  }, [])

  useEffect(() => {
    if (scanning && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner('qr-reader', {
        fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0
      })
      scanner.render(onScanSuccess, onScanError)
      scannerRef.current = scanner
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [scanning])

  const lookupAsset = async (code) => {
    if (!code || !code.trim()) return
    try {
      const { data } = await api.get(`/api/assets/by-code/${code.trim()}`)
      setScannedAsset(data)
      setResult(null)
      toast.success(`Asset found: ${data.name}`)
    } catch {
      toast.error(`Asset "${code}" not found in database`)
    }
  }

  const onScanSuccess = async (decodedText) => {
    let assetCode = decodedText.trim()
    try {
      if (assetCode.startsWith('http://') || assetCode.startsWith('https://')) {
        const url = new URL(assetCode)
        assetCode = url.searchParams.get('asset') || assetCode
      }
    } catch {
      // keep decodedText
    }
    setScanning(false)
    if (scannerRef.current) { scannerRef.current.clear().catch(() => {}); scannerRef.current = null }
    lookupAsset(assetCode)
  }

  const onScanError = () => {}

  const handleAllocate = async () => {
    if (!scannedAsset || !selectedRequest) return toast.error('Please select a request')
    setLoading(true)
    try {
      const { data } = await api.post('/api/allocations/allocate', {
        asset_code: scannedAsset.asset_code,
        request_id: parseInt(selectedRequest),
        due_date: dueDate || undefined
      })
      setResult({ success: true, message: `${data.asset.name} allocated for "${data.request.event}"`, data })
      setScannedAsset(null); setSelectedRequest(''); setDueDate('')
      toast.success('Asset allocated successfully')
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.detail || 'Allocation failed' })
    } finally { setLoading(false) }
  }

  const handleReturn = async () => {
    if (!scannedAsset) return
    setLoading(true)
    try {
      const { data } = await api.post('/api/allocations/return', {
        asset_code: scannedAsset.asset_code,
        return_condition: returnCondition,
        return_notes: returnNotes
      })
      setResult({ success: true, message: `Asset returned successfully. Condition: ${returnCondition}` })
      setScannedAsset(null); setReturnNotes('')
      toast.success('Asset returned successfully')
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.detail || 'Return failed' })
    } finally { setLoading(false) }
  }

  const reset = () => { setScannedAsset(null); setResult(null); setSelectedRequest(''); setDueDate('') }

  return (
    <div className="page-content" style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Mode Toggle */}
      <div className="auth-tabs" style={{ marginBottom: 24 }}>
        <button
          className={`auth-tab ${mode === 'allocate' ? 'active' : ''}`}
          onClick={() => { setMode('allocate'); reset() }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <AllocateGraphic size={16} /> Allocate Asset
        </button>
        <button
          className={`auth-tab ${mode === 'return' ? 'active' : ''}`}
          onClick={() => { setMode('return'); reset() }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <ReturnGraphic size={16} /> Return Asset
        </button>
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`alert ${result.success ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {result.success && <CheckGraphic size={16} />}
            {result.message}
          </div>
          <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Scanner */}
      {!scannedAsset && (
        <div className="card card-pad" style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="scanner-hero-badge">
            <CameraGraphic size={32} color="var(--cream)" />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: 6 }}>
            {mode === 'allocate' ? 'Scan Asset QR to Allocate' : 'Scan Asset QR to Return'}
          </h3>
          <p className="text-muted" style={{ marginBottom: 20 }}>Point your camera at the QR label on the asset</p>

          {!scanning ? (
            <div>
              <button className="btn-dark-scanner btn-lg" style={{ margin: '0 auto 16px' }} onClick={() => setScanning(true)}>
                <ScanGraphic size={20} color="var(--cream)" /> Start Camera Scanner
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>or lookup code manually</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, maxWidth: 360, margin: '0 auto 12px' }}>
                <input
                  className="form-input"
                  placeholder="e.g. AUD-001, LGT-001"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && lookupAsset(manualCode)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => lookupAsset(manualCode)}
                  disabled={!manualCode.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <SearchGraphic size={15} color="var(--cream)" />
                  Lookup
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Quick test:</span>
                {['AUD-001', 'AUD-004', 'LGT-002', 'AV-001'].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setManualCode(c); lookupAsset(c) }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer' }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div id="qr-reader" className="qr-scanner-wrap" style={{ margin: '0 auto 16px' }} />
              <button className="btn btn-outline" onClick={() => { setScanning(false); if (scannerRef.current) { scannerRef.current.clear().catch(()=>{}); scannerRef.current = null } }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Asset Info + Action */}
      {scannedAsset && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--primary-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <PackageGraphic size={26} color="var(--primary)" />
              </div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{scannedAsset.name}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-in_use">{scannedAsset.asset_code}</span>
                  <span className={`badge badge-${scannedAsset.status}`}>{scannedAsset.status.replace('_', ' ')}</span>
                  <span className="badge badge-pending">{scannedAsset.category}</span>
                </div>
              </div>
            </div>

            {mode === 'allocate' && (
              <>
                <div className="form-group">
                  <label className="form-label required">Link to Request</label>
                  <select className="form-select" value={selectedRequest} onChange={e => setSelectedRequest(e.target.value)}>
                    <option value="">Select approved request...</option>
                    {approvedRequests?.requests?.map(r => (
                      <option key={r.id} value={r.id}>
                        #{r.id} — {r.event_name} ({r.user?.name || 'Unknown'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Return Date (optional)</label>
                  <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-success" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleAllocate} disabled={loading || !selectedRequest}>
                    {loading ? <span className="spinner" /> : <CheckGraphic size={16} color="#fff" />} Confirm Allocation
                  </button>
                  <button className="btn btn-outline" onClick={reset}>Rescan</button>
                </div>
              </>
            )}

            {mode === 'return' && (
              <>
                <div className="form-group">
                  <label className="form-label required">Return Condition</label>
                  <select className="form-select" value={returnCondition} onChange={e => setReturnCondition(e.target.value)}>
                    <option value="new">New — Pristine condition</option>
                    <option value="good">Good — Minor wear</option>
                    <option value="fair">Fair — Noticeable wear</option>
                    <option value="damaged">Damaged — Needs repair</option>
                    <option value="lost">Lost — Cannot return</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" placeholder="Any notes about the return condition..."
                    value={returnNotes} onChange={e => setReturnNotes(e.target.value)} rows={2} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleReturn} disabled={loading}>
                    {loading ? <span className="spinner" /> : <ReturnGraphic size={16} color="var(--cream)" />} Confirm Return
                  </button>
                  <button className="btn btn-outline" onClick={reset}>Rescan</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
