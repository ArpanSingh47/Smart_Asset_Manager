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
  const scanCooldownRef = useRef({ code: '', time: 0 })

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
        quantity_approved: 0, // starts at 0; strictly updated when QR codes are scanned!
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
          async (decodedText) => {
            if (decodedText) {
              await handleScannedCode(itemId, decodedText)
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
    if (text.includes('asset=') || text.includes('code=')) {
      try {
        const urlObj = new URL(text.startsWith('http') ? text : `http://localhost/${text}`)
        const codeParam = urlObj.searchParams.get('asset') || urlObj.searchParams.get('code')
        if (codeParam) return codeParam.trim()
      } catch (_) {
        const match = text.match(/(?:asset|code)=([^&]+)/)
        if (match && match[1]) return decodeURIComponent(match[1]).trim()
      }
    }
    if (text.includes('/')) {
      const parts = text.split('/')
      text = parts[parts.length - 1]
      if (text.endsWith('.png') || text.endsWith('.jpg') || text.endsWith('.jpeg') || text.endsWith('.webp')) {
        text = text.substring(0, text.lastIndexOf('.'))
      }
    }
    return text.trim()
  }

  const handleScannedCode = async (itemId, rawCode, silent = false) => {
    const code = parseCode(rawCode)
    if (!code) return false

    // Debounce duplicate camera scans of the exact same code within 2.5 seconds
    const now = Date.now()
    if (scanCooldownRef.current.code === code && now - scanCooldownRef.current.time < 2500) {
      return false
    }

    // Check if code is already assigned to ANY item in the current review modal
    const isAlreadyAssignedInModal = approval.items.some(i => (i.asset_codes || []).includes(code))
    if (isAlreadyAssignedInModal) {
      scanCooldownRef.current = { code, time: now }
      toast.error(`Asset code ${code} is already assigned in this request.`)
      return false
    }

    // Real-time backend check: verify if the product is already in use
    try {
      const { data: asset } = await api.get(`/api/assets/by-code/${encodeURIComponent(code)}`)
      if (asset) {
        if (asset.status === 'in_use') {
          scanCooldownRef.current = { code, time: now }
          toast.error(`⚠️ Product "${asset.name}" (${code}) is ALREADY IN USE! Cannot allocate.`, {
            duration: 5000,
            icon: '🚫'
          })
          return false
        }
        if (asset.status === 'maintenance') {
          scanCooldownRef.current = { code, time: now }
          toast.error(`⚠️ Product "${asset.name}" (${code}) is under maintenance! Cannot allocate.`, {
            duration: 5000,
            icon: '🛠️'
          })
          return false
        }
        if (asset.status === 'retired') {
          scanCooldownRef.current = { code, time: now }
          toast.error(`⚠️ Product "${asset.name}" (${code}) is decommissioned / retired!`, {
            duration: 5000,
            icon: '❌'
          })
          return false
        }
      }
    } catch (err) {
      // 404 is allowed (brand new / unregistered asset code auto-registers upon approval)
      if (err.response?.status !== 404) {
        console.warn('Asset lookup warning:', err)
      }
    }

    scanCooldownRef.current = { code, time: now }

    setApproval(prev => {
      const targetItem = prev.items.find(i => i.request_item_id === itemId)
      if (!targetItem) return prev

      const currentCodes = targetItem.asset_codes || []
      if (currentCodes.includes(code)) {
        return prev
      }

      const newCodes = [...currentCodes, code]
      return {
        ...prev,
        items: prev.items.map(i => i.request_item_id === itemId ? {
          ...i,
          asset_codes: newCodes,
          quantity_approved: newCodes.length
        } : i)
      }
    })

    if (!silent) {
      toast.success(`Scanned: ${code}`)
    }
    return true
  }

  const handleFilesUpload = async (itemId, fileList) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    if (scannerRef.current) {
      await stopScanning()
    }

    const toastId = toast.loading(`Scanning ${files.length} QR image file${files.length > 1 ? 's' : ''}...`)
    let addedCodes = []

    for (const file of files) {
      try {
        const html5QrCode = new Html5Qrcode('qr-file-reader-hidden')
        const decodedText = await html5QrCode.scanFile(file, false)
        if (decodedText) {
          const code = parseCode(decodedText)
          if (code) {
            const added = await handleScannedCode(itemId, code, true)
            if (added) {
              addedCodes.push(code)
            }
          }
        }
        try {
          await html5QrCode.clear()
        } catch (_) {}
      } catch (err) {
        console.warn(`File scan failed for ${file.name}:`, err)
      }
    }

    if (addedCodes.length > 0) {
      toast.success(
        files.length === 1
          ? `Scanned QR code: ${addedCodes[0]}`
          : `Assigned ${addedCodes.length} QR code${addedCodes.length > 1 ? 's' : ''}: ${addedCodes.join(', ')}`,
        { id: toastId }
      )
    } else {
      toast.error('No valid available QR codes could be added from the selected file(s).', { id: toastId })
    }
  }

  const addManualCode = async (itemId) => {
    const raw = manualInputs[itemId]
    if (!raw) return
    const code = parseCode(raw)
    if (!code) return
    const success = await handleScannedCode(itemId, code)
    if (success) {
      setManualInputs(prev => ({ ...prev, [itemId]: '' }))
    }
  }

  const removeCode = (itemId, codeToRemove) => {
    setApproval(prev => ({
      ...prev,
      items: prev.items.map(i => {
        if (i.request_item_id !== itemId) return i
        const newCodes = (i.asset_codes || []).filter(c => c !== codeToRemove)
        return {
          ...i,
          asset_codes: newCodes,
          quantity_approved: newCodes.length
        }
      })
    }))
  }

  const updateItemQty = (id, qty) => {
    setApproval(a => ({
      ...a,
      items: a.items.map(i => i.request_item_id === id ? { ...i, quantity_approved: Math.max(0, qty || 0) } : i)
    }))
  }

  const handleApprove = async () => {
    if (approval.status === 'rejected') {
      try {
        setLoading(true)
        await api.put(`/api/requests/${selected.id}/review`, {
          status: 'rejected',
          admin_notes: approval.admin_notes,
          items: approval.items.map(i => ({
            request_item_id: i.request_item_id,
            quantity_approved: 0,
            asset_codes: []
          }))
        })
        toast.success('Request rejected')
        qc.invalidateQueries({ queryKey: ['admin-requests'] })
        qc.invalidateQueries({ queryKey: ['assets'] })
        closeModal()
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to reject request')
      } finally {
        setLoading(false)
      }
      return
    }

    // Separate scanned vs unscanned items
    const scannedItems = approval.items.filter(i => (i.asset_codes?.length || 0) > 0)
    const unscannedItems = approval.items.filter(i => (!i.asset_codes || i.asset_codes.length === 0))

    if (scannedItems.length === 0) {
      const confirmReject = window.confirm(
        `⚠️ No QR codes were scanned for any items in this request.\n\n` +
        `All requested items will be DECLINED and the request will be REJECTED.\n\n` +
        `Do you want to proceed?`
      )
      if (!confirmReject) return
    } else if (unscannedItems.length > 0) {
      const unscannedNames = unscannedItems.map(i => {
        const orig = selected.items.find(x => x.id === i.request_item_id)
        return `• ${orig?.item_name || 'Item'} (${orig?.quantity_requested || 1} requested)`
      }).join('\n')

      const confirmPartial = window.confirm(
        `⚠️ Partial Approval Notice:\n\n` +
        `QR codes were NOT scanned for the following item(s):\n${unscannedNames}\n\n` +
        `These unscanned items will be DECLINED (Approved: 0).\n` +
        `Only the scanned items will be approved and allocated.\n\n` +
        `Do you want to submit this decision?`
      )
      if (!confirmPartial) return
    }

    // Determine target status
    let submitStatus = 'approved'
    if (scannedItems.length === 0) {
      submitStatus = 'rejected'
    } else {
      const isFullySatisfied = approval.items.every(i => {
        const orig = selected.items.find(x => x.id === i.request_item_id)
        return (i.asset_codes?.length || 0) >= (orig?.quantity_requested || 1)
      })
      submitStatus = isFullySatisfied ? 'approved' : 'partially_approved'
    }

    try {
      setLoading(true)
      await api.put(`/api/requests/${selected.id}/review`, {
        status: submitStatus,
        admin_notes: approval.admin_notes,
        items: approval.items.map(i => ({
          request_item_id: i.request_item_id,
          quantity_approved: i.asset_codes?.length || 0,
          asset_codes: i.asset_codes || []
        }))
      })

      if (submitStatus === 'approved') {
        toast.success('Request fully approved & assets allocated!')
      } else if (submitStatus === 'partially_approved') {
        toast.success('Request partially approved. Unscanned items were declined.')
      } else {
        toast.success('Request rejected (no QR codes scanned).')
      }

      qc.invalidateQueries({ queryKey: ['admin-requests'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      closeModal()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit review')
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
                    const assignedCodes = approvalItem?.asset_codes || []
                    const approvedQty = approvalItem?.quantity_approved ?? assignedCodes.length
                    const isScanning = scanningItemId === item.id
                    const isDeclined = assignedCodes.length === 0
                    const isPartial = assignedCodes.length > 0 && assignedCodes.length < item.quantity_requested
                    const isComplete = assignedCodes.length >= item.quantity_requested

                    return (
                      <div key={item.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                        {/* Item Summary Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {item.category}{item.notes ? ` · ${item.notes}` : ''}
                            </div>
                            {item.is_other && <span className="badge badge-warning" style={{ fontSize: 10, marginTop: 4 }}>Custom item</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                              Requested: <strong>{item.quantity_requested}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>Approved:</span>
                              <strong style={{
                                fontSize: 14,
                                padding: '3px 10px',
                                borderRadius: 6,
                                background: isComplete ? 'rgba(16, 185, 129, 0.15)' : isPartial ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: isComplete ? 'var(--success)' : isPartial ? 'var(--warning)' : 'var(--error)'
                              }}>
                                {approvedQty}
                              </strong>
                            </div>
                            <div>
                              {isComplete && (
                                <span className="badge badge-success" style={{ fontSize: 11 }}>✅ Fully Approved ({approvedQty}/{item.quantity_requested})</span>
                              )}
                              {isPartial && (
                                <span className="badge badge-warning" style={{ fontSize: 11 }}>⚠️ Partially Scanned ({approvedQty}/{item.quantity_requested})</span>
                              )}
                              {isDeclined && (
                                <span className="badge badge-error" style={{ fontSize: 11, background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)' }}>
                                  ❌ Declined (Unscanned)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Dedicated "📷 Product QR Code" Section */}
                        {selected.status === 'pending' && approval.status !== 'rejected' && (
                          <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                              e.preventDefault()
                              if (e.dataTransfer.files?.length) {
                                handleFilesUpload(item.id, e.dataTransfer.files)
                              }
                            }}
                            style={{
                              marginTop: 12,
                              padding: '12px 14px',
                              background: 'var(--surface-2)',
                              borderRadius: 8,
                              border: isDeclined ? '1px dashed rgba(239, 68, 68, 0.4)' : '1px solid var(--border)'
                            }}
                          >
                            {/* Section Header */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 10,
                              flexWrap: 'wrap',
                              gap: 8
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 15 }}>📷</span>
                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--primary)' }}>Product QR Code</span>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  background: assignedCodes.length >= item.quantity_requested ? 'rgba(16, 185, 129, 0.15)' : assignedCodes.length > 0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: assignedCodes.length >= item.quantity_requested ? 'var(--success)' : assignedCodes.length > 0 ? 'var(--warning)' : 'var(--error)'
                                }}>
                                  {assignedCodes.length} of {item.quantity_requested} assigned
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                                    style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                                    onClick={() => startScanning(item.id)}
                                    title="Scan QR using camera feed"
                                  >
                                    <span>📷</span>
                                    <span>Scan Camera</span>
                                  </button>
                                )}

                                <label
                                  className="btn btn-outline btn-sm"
                                  style={{
                                    fontSize: 12,
                                    padding: '4px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    cursor: 'pointer',
                                    margin: 0
                                  }}
                                  title="Upload QR image file (PNG, JPG, etc.)"
                                >
                                  <span>📁</span>
                                  <span>Upload File</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      if (e.target.files?.length) {
                                        handleFilesUpload(item.id, e.target.files)
                                        e.target.value = ''
                                      }
                                    }}
                                  />
                                </label>
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

                            {/* Manual Entry (+ Add) & Drop Hint */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{ flex: 1, padding: '6px 12px', fontSize: 13 }}
                                placeholder="Type/paste code (e.g. AUD-001) or drag & drop QR image file..."
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
                        <option value="approved">✅ Allocate Scanned Items (Decline Unscanned)</option>
                        <option value="rejected">❌ Reject Entire Request</option>
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

      {/* Hidden container for Html5Qrcode file scan processing */}
      <div
        id="qr-file-reader-hidden"
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: 320,
          height: 320,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1
        }}
      />
    </div>
  )
}
