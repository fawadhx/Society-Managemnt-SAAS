'use client'

import { useState } from 'react'
import { X, Home, CheckCircle2, Plus, Lock, Building2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety, type Society } from '@/lib/society-context'

type Props = {
  close: () => void
  onSuccess: (msg: string) => void
}

export default function SocietySwitcherModal({ close, onSuccess }: Props) {
  const { societies, currentSociety, switchSociety, addSociety, deleteSociety, canMultiSociety } = useSociety()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')

  const handleSelect = async (society: Society) => {
    if (society.id === currentSociety.id) { close(); return }
    await switchSociety(society.id)
    onSuccess(`Switched to ${society.name}`)
  }

  const handleDelete = async (e: React.MouseEvent, society: Society) => {
    e.stopPropagation()
    if (!confirm(`Delete ${society.name}? This will remove all associated units and invoices.`)) return
    if (societies.length <= 1) { alert('Cannot delete the last society.'); return }
    await deleteSociety(society.id)
    onSuccess(`${society.name} deleted.`)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    await addSociety(newName.trim(), newAddress.trim())
    setNewName('')
    setNewAddress('')
    setShowAdd(false)
    onSuccess(`${newName.trim()} added successfully.`)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Switch Society</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="society-list">
          {societies.map(s => (
            <button
              key={s.id}
              className={`society-list-item ${s.id === currentSociety.id ? 'active' : ''} ${!canMultiSociety ? 'locked' : ''}`}
              onClick={() => canMultiSociety && handleSelect(s)}
            >
              <div className="society-list-icon"><Home size={18} /></div>
              <div className="society-list-info">
                <strong>{s.name}</strong>
                <span>{s.address}</span>
              </div>
              {s.id === currentSociety.id && <CheckCircle2 size={18} className="society-check" />}
              {societies.length > 1 && <button className="society-delete-btn" onClick={(e) => handleDelete(e, s)} title={`Delete ${s.name}`} aria-label={`Delete ${s.name}`}><Trash2 size={14} /></button>}
            </button>
          ))}
        </div>

        {!canMultiSociety && <div className="upgrade-banner" style={{ marginTop: 12 }}><Lock size={18} /><p>Multi-Society Management requires Tier 3 Enterprise (PKR 5,000/mo).</p></div>}

        {!showAdd && canMultiSociety && (
            <Button variant="outline" className="full-button" onClick={() => setShowAdd(true)}>
              <Plus data-icon="inline-start" />Add New Society / Plaza
            </Button>
        )}

        {showAdd && (
          <div className="add-society-form">
            <div className="form-grid">
              <label>
                <span className="label-with-icon"><Building2 size={14} /> Society Name</span>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Lake City Apartments" />
              </label>
              <label className="span-2">
                <span className="label-with-icon"><Home size={14} /> Address</span>
                <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="e.g. Main Boulevard, DHA Phase 5, Lahore" />
              </label>
            </div>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewName(''); setNewAddress('') }}>Cancel</Button>
              <Button onClick={handleAdd}><CheckCircle2 data-icon="inline-start" />Create Society</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
