import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const CATEGORIES = ['Audio', 'Lighting', 'Furniture', 'AV Equipment', 'Sports', 'IT Equipment', 'Stage', 'Other']

export default function AssetsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [qrConfig, setQrConfig] = useState({ cols: 3, rows: 4, include_name: true, include_id: true, include_category: true, scope: 'selected' })
  const [form, setForm] = useState({ name: '', category: '', description: '', condition: 'good' })
  const [loading, setLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  const { data, isLoading } = useQuery({
    queryKey: ['assets', search, catFilter, statusFilter],
    queryFn: () => api.get(`/api/assets?search=${search}&category=${catFilter}&status=${statusFilter}`).then(r => r.data),
  })

  const handleAdd = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      await api.post('/api/assets', form)
      toast.success('Asset created!'); setShowAddModal(false)
      setForm({ name: '', category: '', description: '', condition: 'good' })
      qc.invalidateQueries(['assets'])
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    finally { setLoading(false) }
  }

  const handleImport = async (e) => {
    e.preventDefault(); setLoading(true)
    const file = fileRef.current?.files[0]
    if (!file) return toast.error('Select a file first')
    const fd = new FormData(); fd.append('file', file)
    try {
      const { data } = await api.post('/api/assets/bulk-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(data)
      toast.success(`${data.created} assets imported!`)
      qc.invalidateQueries(['assets'])
    } catch (err) { toast.error(err.response?.data?.detail || 'Import failed') }
    finally { setLoading(false) }
  }

  const downloadQRPdf = async () => {
    setLoading(true)
    try {
      const { cols, rows, include_name, include_id, include_category, scope } = qrConfig
      let url, body
      if (scope === 'all') {
        url = `/api/assets/generate-qr-pdf-all?cols=${cols}&rows=${rows}&include_name=${include_name}&include_id=${include_id}&include_category=${include_category}`
      } else {
        url = `/api/assets/generate-qr-pdf?cols=${cols}&rows=${rows}&include_name=${include_name}&include_id=${include_id}&include_category=${include_category}`
        body = selectedIds
      }
      const res = await api.request({
        url, method: scope === 'all' ? 'POST' : 'POST',
        data: body, responseType: 'blob'
      })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'qr_labels.pdf'
      link.click()
      toast.success('PDF downloaded!')
      setShowQRModal(false)
    } catch { toast.error('PDF generation failed') }
    finally { setLoading(false) }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const totalPages = Math.ceil(selectedIds.length / (qrConfig.cols * qrConfig.rows))

  if (isLoading) return <div className="loading-page"><div className="spinner spinner-dark"/><span>Loading assets...</span></div>

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 22 }}>Asset Inventory</h2>
          <p className="text-muted">{data?.total || 0} total assets</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <button className="btn btn-accent btn-sm" onClick={() => { setQrConfig(c => ({ ...c, scope: 'selected' })); setShowQRModal(true) }}>
              🏷️ QR PDF ({selectedIds.length})
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => { setQrConfig(c => ({ ...c, scope: 'all' })); setShowQRModal(true) }}>
            📄 All QR PDF
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowImportModal(true)}>
            📊 Import CSV/Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
            + Add Asset
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-pad mb-4">
        <div className="form-row-3">
          <input className="form-input" placeholder="🔍 Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="available">Available</option>
            <option value="in_use">In Use</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? data.assets.map(a => a.id) : [])} /></th>
                <th>Asset Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Status</th>
                <th>Condition</th>
                <th>QR</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.assets?.length ? data.assets.map(a => (
                <tr key={a.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelect(a.id)} /></td>
                  <td><code style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>{a.asset_code}</code></td>
                  <td><div style={{ fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.description?.slice(0, 40)}</div></td>
                  <td><span className="badge badge-pending">{a.category}</span></td>
                  <td><span className={`badge badge-${a.status}`}>{a.status?.replace('_', ' ')}</span></td>
                  <td><span className="badge badge-available">{a.condition}</span></td>
                  <td>
                    {a.qr_code_url && (
                      <a href={`http://localhost:8000${a.qr_code_url}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        🔗 View QR
                      </a>
                    )}
                  </td>
                  <td>
                    <button onClick={() => { setSelectedIds([a.id]); setQrConfig(c => ({ ...c, scope: 'selected' })); setShowQRModal(true) }}
                      className="btn btn-outline btn-sm">🏷️ Print</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8}><div className="empty-state"><p>No assets found</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add New Asset</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Asset Name</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Condenser Microphone" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required">Category</label>
                    <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required>
                      <option value="">Select...</option>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Condition</label>
                    <select className="form-select" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                      <option value="new">New</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="alert alert-info" style={{ marginTop: 0 }}>
                  💡 A unique asset code and QR will be auto-generated.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <span className="spinner" /> : '+ Add Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Import Assets via CSV / Excel</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowImportModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                <div>
                  <strong>Required columns:</strong> <code>name, category, condition</code><br />
                  <strong>Optional:</strong> <code>description, quantity</code><br />
                  Setting <code>quantity=5</code> creates 5 separate asset records with individual QR codes.
                </div>
              </div>
              {importResult ? (
                <div>
                  <div className="alert alert-success">✅ {importResult.created} assets imported successfully</div>
                  {importResult.errors?.length > 0 && (
                    <div className="alert alert-error">❌ {importResult.errors.length} errors: {importResult.errors.slice(0, 3).join(', ')}</div>
                  )}
                  {importResult.warnings?.length > 0 && (
                    <div className="alert alert-warning">⚠️ {importResult.warnings.length} warnings</div>
                  )}
                  <button className="btn btn-accent btn-sm" onClick={() => { setQrConfig(c => ({ ...c, scope: 'all' })); setShowQRModal(true); setShowImportModal(false) }}>
                    🏷️ Download QR PDF for imported assets
                  </button>
                </div>
              ) : (
                <form onSubmit={handleImport}>
                  <div className="form-group">
                    <label className="form-label required">Select File</label>
                    <input ref={fileRef} type="file" className="form-input" accept=".csv,.xlsx,.xls" />
                  </div>
                  <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 16 }}>
                    <button type="button" className="btn btn-outline" onClick={() => setShowImportModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? <><span className="spinner"/> Importing...</> : '📥 Import & Generate QRs'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR PDF Config Modal */}
      {showQRModal && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🏷️ Configure QR Label Sheet</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowQRModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                Printing: <strong>{qrConfig.scope === 'all' ? `All ${data?.total || 0}` : selectedIds.length} assets</strong> on A4 paper.
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Columns per page</label>
                  <select className="form-select" value={qrConfig.cols} onChange={e => setQrConfig(c => ({ ...c, cols: parseInt(e.target.value) }))}>
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} column{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Rows per page</label>
                  <select className="form-select" value={qrConfig.rows} onChange={e => setQrConfig(c => ({ ...c, rows: parseInt(e.target.value) }))}>
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} row{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Labels per page: <strong style={{ color: 'var(--accent)' }}>{qrConfig.cols * qrConfig.rows}</strong></label>
                <div style={{ padding: '10px', background: 'var(--info-bg)', borderRadius: 8, fontSize: 13 }}>
                  📄 Estimated pages: <strong>{Math.ceil((qrConfig.scope === 'all' ? (data?.total || 0) : selectedIds.length) / (qrConfig.cols * qrConfig.rows))}</strong>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Include on label</label>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { key: 'include_name', label: 'Asset Name' },
                    { key: 'include_id', label: 'Asset ID/Code' },
                    { key: 'include_category', label: 'Category' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={qrConfig[key]} onChange={e => setQrConfig(c => ({ ...c, [key]: e.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowQRModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={downloadQRPdf} disabled={loading}>
                {loading ? <><span className="spinner"/> Generating...</> : '📄 Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
