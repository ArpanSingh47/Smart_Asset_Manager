import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

export default function RequestsAdmin() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [approval, setApproval] = useState({ status: 'approved', admin_notes: '', items: [] })
  const [manualInputs, setManualInputs] = useState({})
  const [scanningItemId, setScanningItemId] = useState(null)
  const [loading, setLoading] = useState(false)
  const scannerRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-requests', statusFilter],
    queryFn: () => api.get(`/api/requests/all?status=${statusFilter}`).then(r => r.data),
  })

  // Cleanup scanner on unmount or modal close
  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // Scanner might already be stopped
      }
      try {
        await scannerRef.current.clear()
      } catch {}
      scannerRef.current = null
    }
    setScanningItemId(null)
  }

  useEffect(() => {
    return () => {
      stopScanning()
    }
  }, [])

  const closeModal = () => {
    stopScanning()
    setSelected(null)
  }

  const openReview = async (reqId) => {
    await stopScanning()
    const { data } = await api.get(`/api/requests/${reqId}`)
    setSelected(data)
    setApproval({
      status: 'approved',
      admin_notes: '',
      items: data.items.map(i => ({
        request_item_id: i.id,
        quantity_approved: i.quantity_requested,
        asset_codes: []
      }))
    })
    setManualInputs({})
  }

  const startScanning = (itemId) => {
    if (scannerRef.current) {
      stopScanning()
    }

    setScanningItemId(itemId)

    // Safe deferred DOM mounting: wait for React modal state to render the element
    setTimeout(async () => {
      const elemId = `qr-reader-${itemId}`
      const elem = document.getElementById(elemId)
      if (!elem) {
        console.warn(`DOM container #${elemId} not found for QR scanner`)
        return
      }

      try {
        const qrScanner = new Html5Qrcode(elemId)
        scannerRef.current = qrScanner

        await qrScanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (decodedText) {
              handleScannedCode(itemId, decodedText)
            }
          },
          () => {
            // Frame scan failure - ignore for continuous feed
          }
        )
      } catch (err) {
        console.error('Camera initialization failed:', err)
        toast.error('Unable to access camera. Check device permissions or enter code manually.')
        setScanningItemId(null)
        scannerRef.current = null
      }
    }, 120)
  }

  const parseCode = (raw) => {
    if (!raw) return ''
    let text = raw.trim()
    if (text.includes('/')) {
      const parts = text.split('/')
      text = parts[parts.length - 1]
      if (text.endsWith('.png') || text.endsWith('.jpg') || text.endsWith('.webp')) {
        text = text.substring(0, text.lastIndexOf('.'))
      }
    }
    return text.trim()
  }

  const handleScannedCode = (itemId, rawCode) => {
    const code = parseCode(rawCode)
    if (!code) return

    setApproval(prev => {
      const targetItem = prev.items.find(i => i.request_item_id === itemId)
      if (!targetItem) return prev

      const currentCodes = targetItem.asset_codes || []
      if (currentCodes.includes(code)) {
        return prev // Prevent duplicate scan spam
      }

      toast.success(`Scanned: ${code}`)
      return {
        ...prev,
        items: prev.items.map(i => i.request_item_id === itemId ? {
          ...i,
          asset_codes: [...currentCodes, code]
        } : i)
      }
    })
  }

  const addManualCode = (itemId) => {
    const raw = manualInputs[itemId]
    if (!raw) return
    const code = parseCode(raw)
    if (!code) return

    setApproval(prev => {
      const targetItem = prev.items.find(i => i.request_item_id === itemId)
      if (!targetItem) return prev

      const currentCodes = targetItem.asset_codes || []
      if (currentCodes.includes(code)) {
        toast.error(`Code ${code} already added`)
        return prev
      }

      toast.success(`Added: ${code}`)
      return {
        ...prev,
        items: prev.items.map(i => i.request_item_id === itemId ? {
          ...i,
          asset_codes: [...currentCodes, code]
        } : i)
      }
    })

    setManualInputs(prev => ({ ...prev, [itemId]: '' }))
  }

  const removeCode = (itemId, codeToRemove) => {
    setApproval(prev => ({
      ...prev,
      items: prev.items.map(i => i.request_item_id === itemId ? {
        ...i,
        asset_codes: (i.asset_codes || []).filter(c => c !== codeToRemove)
      } : i)
    }))
  }

  const updateItemQty = (id, qty) => {
    setApproval(a => ({
      ...a,
      items: a.items.map(i => i.request_item_id === id ? { ...i, quantity_approved: Math.max(0, qty || 0) } : i)
    }))
  }

  const handleApprove = async () => {
    // Verification check warning admins if they attempt to approve without scanning/assigning QR codes
    if (approval.status === 'approved' || approval.status === 'partially_approved') {
      const itemsMissingCodes = approval.items.filter(i => {
        return (i.quantity_approved > 0) && (!i.asset_codes || i.asset_codes.length === 0)
      })

      if (itemsMissingCodes.length > 0) {
        const itemNames = itemsMissingCodes.map(i => {
          const reqItem = selected.items.find(x => x.id === i.request_item_id)
          return reqItem ? `• ${reqItem.item_name} (Approved: ${i.quantity_approved})` : ''
        }).filter(Boolean).join('\n')

        const confirmed = window.confirm(
          `⚠️ WARNING: QR Codes Not Assigned!\n\n` +
          `You have not scanned or assigned QR asset codes for the following approved item(s):\n${itemNames}\n\n` +
          `Items approved without QR codes will not automatically link to physical inventory or generate active allocations.\n\n` +
          `Do you want to proceed anyway?`
        )
        if (!confirmed) return
      }
    }

    setLoading(true)
    try {
      await api.put(`/api/requests/${selected.id}/review`, approval)
      toast.success(`Request ${approval.status}!`)
      closeModal()
      qc.invalidateQueries(['admin-requests'])
      qc.invalidateQueries(['assets'])
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed')
    } finally {
      setLoading(false)
    }
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
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 740 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-title">Request #{selected.id} — {selected.event_name}</span>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  By {selected.user?.name} ({selected.user?.department}) · {selected.event_date ? new Date(selected.event_date).toLocaleDateString() : ''}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {/* Request Info */}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><span className="text-muted">Venue</span><div style={{ fontWeight: 600 }}>{selected.venue?.name || 'N/A'}</div></div>
                <div><span className="text-muted">Return By</span><div style={{ fontWeight: 600 }}>{selected.expected_return_date ? new Date(selected.expected_return_date).toLocaleDateString() : 'N/A'}</div></div>
                <div><span className="text-muted">Time</span><div style={{ fontWeight: 600 }}>{selected.event_start_time} – {selected.event_end_time}</div></div>
                <div><span className="text-muted">Purpose</span><div style={{ fontWeight: 600 }}>{selected.purpose || '—'}</div></div>
              </div>

              {/* Items Review & Product QR Scanner */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 14 }}>Requested Items & QR Allocation</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {selected.items.map(item => {
                    const approvalItem = approval.items.find(i => i.request_item_id === item.id)
                    const approvedQty = approvalItem?.quantity_approved ?? item.quantity_requested
                    const assignedCodes = approvalItem?.asset_codes || []
                    const isScanning = scanningItemId === item.id

                    return (
                      <div key={item.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                        {/* Item Summary Row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {item.category}{item.notes ? ` · ${item.notes}` : ''}
                            </div>
                            {item.is_other && <span className="badge badge-warning" style={{ fontSize: 10, marginTop: 4 }}>Custom item</span>}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            Requested: <strong>{item.quantity_requested}</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Approve:</span>
                            <input
                              type="number"
                              min={0}
                              max={item.quantity_requested}
                              className="form-input"
                              style={{ width: 70 }}
                              value={approvedQty}
                              disabled={selected.status !== 'pending'}
                              onChange={e => updateItemQty(item.id, parseInt(e.target.value))}
                            />
                          </div>
                        </div>

                        {/* Dedicated "📷 Product QR Code" Section */}
                        {selected.status === 'pending' && (approval.status === 'approved' || approval.status === 'partially_approved') && approvedQty > 0 && (
                          <div style={{
                            marginTop: 12,
                            padding: '12px 14px',
                            background: 'var(--surface-2)',
                            borderRadius: 8,
                            border: '1px solid var(--border)'
                          }}>
                            {/* Section Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 15 }}>📷</span>
                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--primary)' }}>Product QR Code</span>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  background: assignedCodes.length >= approvedQty ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                  color: assignedCodes.length >= approvedQty ? 'var(--success)' : 'var(--warning)'
                                }}>
                                  {assignedCodes.length} of {approvedQty} assigned
                                </span>
                              </div>

                              <div>
                                {isScanning ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    style={{ borderColor: 'var(--error)', color: 'var(--error)', fontSize: 12, padding: '4px 10px' }}
                                    onClick={stopScanning}
                                  >
                                    ✕ Stop Camera
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-accent btn-sm"
                                    style={{ fontSize: 12, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                                    onClick={() => startScanning(item.id)}
                                  >
                                    <span>📷</span>
                                    <span>Scan QR</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* html5-qrcode Camera Feed Mount */}
                            {isScanning && (
                              <div style={{
                                marginBottom: 12,
                                border: '2px dashed var(--accent)',
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: '#111',
                                padding: 8
                              }}>
                                <div id={`qr-reader-${item.id}`} style={{ width: '100%', minHeight: 240 }} />
                                <div style={{ textAlign: 'center', fontSize: 12, color: '#ccc', marginTop: 8 }}>
                                  🎯 Align asset QR code within camera frame. Scanned items add automatically.
                                </div>
                              </div>
                            )}

                            {/* Manual Entry (+ Add) for Barcode Guns & Copy-Pasting */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{ flex: 1, padding: '6px 12px', fontSize: 13 }}
                                placeholder="Type or scan barcode (e.g. AUD-001)..."
                                value={manualInputs[item.id] || ''}
                                onChange={e => setManualInputs({ ...manualInputs, [item.id]: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addManualCode(item.id)
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ fontSize: 12, padding: '6px 14px' }}
                                onClick={() => addManualCode(item.id)}
                              >
                                + Add
                              </button>
                            </div>

                            {/* Scanned Asset Badges / Chips with Quick Removal */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28, alignItems: 'center' }}>
                              {assignedCodes.length === 0 ? (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                  No asset QR codes assigned yet. Scan with camera above or enter code manually.
                                </span>
                              ) : (
                                assignedCodes.map(code => (
                                  <span
                                    key={code}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: 'var(--surface-1)',
                                      border: '1.5px solid var(--accent)',
                                      color: 'var(--primary)',
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      fontSize: 12,
                                      fontWeight: 600
                                    }}
                                  >
                                    <span>🏷️</span>
                                    <code>{code}</code>
                                    <button
                                      type="button"
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--error)',
                                        cursor: 'pointer',
                                        padding: '0 2px',
                                        fontSize: 14,
                                        fontWeight: 700,
                                        lineHeight: 1
                                      }}
                                      title="Remove code"
                                      onClick={() => removeCode(item.id, code)}
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {selected.status === 'pending' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Decision</label>
                      <select
                        className="form-select"
                        value={approval.status}
                        onChange={e => setApproval(a => ({ ...a, status: e.target.value }))}
                      >
                        <option value="approved">✅ Approve</option>
                        <option value="partially_approved">⚠️ Partially Approve</option>
                        <option value="rejected">❌ Reject</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Admin Notes (sent to user)</label>
                    <textarea
                      className="form-textarea"
                      rows={2}
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
                <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
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
