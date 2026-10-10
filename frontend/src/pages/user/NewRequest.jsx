import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const COMMON_ITEMS = [
  { name: 'Microphone (Wired)', category: 'Audio' },
  { name: 'Microphone (Wireless)', category: 'Audio' },
  { name: 'Speaker / PA System', category: 'Audio' },
  { name: 'Amplifier', category: 'Audio' },
  { name: 'Spotlight', category: 'Lighting' },
  { name: 'LED Panel Light', category: 'Lighting' },
  { name: 'Extension Cord (Power)', category: 'Electrical' },
  { name: 'Projector', category: 'AV Equipment' },
  { name: 'Projection Screen', category: 'AV Equipment' },
  { name: 'HDMI Cable', category: 'AV Equipment' },
  { name: 'Laptop Stand', category: 'AV Equipment' },
  { name: 'Folding Chair', category: 'Furniture' },
  { name: 'Table (Rectangle)', category: 'Furniture' },
  { name: 'Podium / Lectern', category: 'Furniture' },
  { name: 'Stage Platform', category: 'Stage' },
  { name: 'Backdrop / Banner Stand', category: 'Stage' },
]

const emptyItem = () => ({ item_name: '', category: '', quantity_requested: 1, is_other: false, notes: '', _key: Date.now() })

export default function NewRequest() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    event_name: '', venue_id: '', event_date: '', event_start_time: '',
    event_end_time: '', expected_return_date: '', purpose: ''
  })
  const [items, setItems] = useState([emptyItem()])

  const { data: venues } = useQuery({ queryKey: ['venues'], queryFn: () => api.get('/api/venues').then(r => r.data) })

  const addItem = () => setItems(i => [...i, emptyItem()])
  const removeItem = (key) => setItems(i => i.filter(x => x._key !== key))
  const updateItem = (key, field, value) => setItems(i => i.map(x => x._key === key ? { ...x, [field]: value } : x))

  const selectPreset = (key, preset) => {
    updateItem(key, 'item_name', preset.name)
    updateItem(key, 'category', preset.category)
    updateItem(key, 'is_other', false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validItems = items.filter(i => i.item_name.trim())
    if (!validItems.length) return toast.error('Add at least one item')
    setLoading(true)
    try {
      const payload = {
        ...form,
        venue_id: form.venue_id ? parseInt(form.venue_id) : null,
        items: validItems.map(({ _key, ...i }) => i)
      }
      const { data } = await api.post('/api/requests', payload)
      toast.success('Request submitted successfully!')
      navigate('/my-requests')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="page-content" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontWeight: 700, fontSize: 22 }}>New Asset Request</h2>
        <p className="text-muted">Fill in event details and the items you need. Your request will be reviewed by the admin.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Event Details */}
        <div className="card card-pad mb-4">
          <h3 style={{ fontWeight: 700, marginBottom: 16, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            🎭 Event Details
          </h3>
          <div className="form-group">
            <label className="form-label required">Event / Programme Name</label>
            <input className="form-input" placeholder="e.g. Annual Tech Fest 2026"
              value={form.event_name} onChange={e => setForm({ ...form, event_name: e.target.value })} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Event Date</label>
              <input type="date" className="form-input" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Venue</label>
              <select className="form-select" value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })}>
                <option value="">Select venue (optional)</option>
                {venues?.map(v => <option key={v.id} value={v.id}>{v.name} {v.location ? `— ${v.location}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input type="time" className="form-input" value={form.event_start_time} onChange={e => setForm({ ...form, event_start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input type="time" className="form-input" value={form.event_end_time} onChange={e => setForm({ ...form, event_end_time: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Expected Return Date</label>
              <input type="date" className="form-input" value={form.expected_return_date} onChange={e => setForm({ ...form, expected_return_date: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Purpose / Description</label>
            <textarea className="form-textarea" placeholder="Brief description of the event..."
              value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} rows={2} />
          </div>
        </div>

        {/* Items */}
        <div className="card card-pad mb-4">
          <h3 style={{ fontWeight: 700, marginBottom: 16, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            📦 Required Items
          </h3>

          {items.map((item, idx) => (
            <div key={item._key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>Item #{idx + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(item._key)} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>✕ Remove</button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={item.is_other} onChange={e => updateItem(item._key, 'is_other', e.target.checked)} style={{ marginRight: 6 }} />
                  Custom / Other item
                </label>
              </div>

              {!item.is_other ? (
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Select Item</label>
                    <select className="form-select" value={item.item_name}
                      onChange={e => {
                        const preset = COMMON_ITEMS.find(p => p.name === e.target.value)
                        if (preset) selectPreset(item._key, preset)
                      }} required={!item.is_other}>
                      <option value="">Choose from list...</option>
                      {Object.entries(COMMON_ITEMS.reduce((acc, i) => { (acc[i.category] = acc[i.category] || []).push(i); return acc }, {})).map(([cat, items]) => (
                        <optgroup key={cat} label={cat}>
                          {items.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, maxWidth: 110 }}>
                    <label className="form-label required">Qty</label>
                    <input type="number" min={1} className="form-input"
                      value={item.quantity_requested} onChange={e => updateItem(item._key, 'quantity_requested', parseInt(e.target.value))} />
                  </div>
                </div>
              ) : (
                <div className="form-row-3">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Item Name</label>
                    <input className="form-input" placeholder="Describe the item..." value={item.item_name}
                      onChange={e => updateItem(item._key, 'item_name', e.target.value)} required={item.is_other} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Category</label>
                    <input className="form-input" placeholder="e.g. Electrical" value={item.category}
                      onChange={e => updateItem(item._key, 'category', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Qty</label>
                    <input type="number" min={1} className="form-input"
                      value={item.quantity_requested} onChange={e => updateItem(item._key, 'quantity_requested', parseInt(e.target.value))} />
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
                <label className="form-label">Additional Notes</label>
                <input className="form-input" placeholder="Any special requirements..." value={item.notes}
                  onChange={e => updateItem(item._key, 'notes', e.target.value)} />
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-outline w-full" onClick={addItem}>
            + Add Another Item
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/dashboard')}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <><span className="spinner"/> Submitting...</> : '📨 Submit Request'}
          </button>
        </div>
      </form>
    </div>
  )
}
