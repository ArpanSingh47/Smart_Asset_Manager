import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

export default function VenuesAdmin() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', capacity: '', location: '', facilities: [] })
  const [loading, setLoading] = useState(false)
  const [facilityInput, setFacilityInput] = useState('')

  const { data: venues } = useQuery({
    queryKey: ['venues'],
    queryFn: () => api.get('/api/venues').then(r => r.data),
  })

  const openAdd = () => { setEditing(null); setForm({ name: '', capacity: '', location: '', facilities: [] }); setShowModal(true) }
  const openEdit = (v) => {
    setEditing(v)
    setForm({ name: v.name, capacity: v.capacity || '', location: v.location || '', facilities: v.facilities || [] })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const payload = { ...form, capacity: form.capacity ? parseInt(form.capacity) : null }
      if (editing) {
        await api.put(`/api/venues/${editing.id}`, payload)
        toast.success('Venue updated!')
      } else {
        await api.post('/api/venues', payload)
        toast.success('Venue created!')
      }
      setShowModal(false); qc.invalidateQueries(['venues'])
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    finally { setLoading(false) }
  }

  const addFacility = () => {
    if (facilityInput.trim()) {
      setForm(f => ({ ...f, facilities: [...f.facilities, facilityInput.trim()] }))
      setFacilityInput('')
    }
  }

  const removeFacility = (idx) => setForm(f => ({ ...f, facilities: f.facilities.filter((_, i) => i !== idx) }))

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontWeight: 700, fontSize: 22 }}>Venues</h2>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Venue</button>
      </div>
      <div className="grid-3">
        {venues?.map(v => (
          <div key={v.id} className="card card-pad" style={{ cursor: 'pointer' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏛️</div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{v.name}</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 8 }}>📍 {v.location || 'Location not set'}</p>
            {v.capacity && <p className="text-sm" style={{ marginBottom: 10 }}>👥 Capacity: <strong>{v.capacity}</strong></p>}
            {v.facilities?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {v.facilities.map(f => <span key={f} className="badge badge-info" style={{ fontSize: 10 }}>{f}</span>)}
              </div>
            )}
            <button className="btn btn-outline btn-sm w-full" onClick={() => openEdit(v)}>Edit</button>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Venue' : 'Add Venue'}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Venue Name</label>
                  <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Capacity</label>
                    <input type="number" className="form-input" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input className="form-input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Facilities</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="form-input" placeholder="e.g. Projector, AC, Stage" value={facilityInput}
                      onChange={e => setFacilityInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFacility())} />
                    <button type="button" className="btn btn-outline" onClick={addFacility}>Add</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {form.facilities.map((f, i) => (
                      <span key={i} className="badge badge-info" style={{ cursor: 'pointer', gap: 6 }} onClick={() => removeFacility(i)}>
                        {f} ✕
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner" /> : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
