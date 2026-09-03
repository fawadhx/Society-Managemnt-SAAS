'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Society } from '@/lib/society-context'

type Props = {
  society: Society
  unitCount: number
  disabled?: boolean
  onSave: (updates: Partial<Pick<Society, 'name' | 'address' | 'defaultFee' | 'dueDay' | 'lateFeePct'>>) => Promise<void>
  notify: (msg: string) => void
}

export default function SocietyProfileForm({ society, unitCount, disabled, onSave, notify }: Props) {
  const [name, setName] = useState(society.name)
  const [address, setAddress] = useState(society.address)
  const [defaultFee, setDefaultFee] = useState(String(society.defaultFee ?? 0))
  const [dueDay, setDueDay] = useState(String(society.dueDay ?? 10))
  const [lateFeePct, setLateFeePct] = useState(String(society.lateFeePct ?? 0))
  const [saving, setSaving] = useState(false)

  const dirty =
    name !== society.name || address !== society.address ||
    Number(defaultFee) !== (society.defaultFee ?? 0) ||
    Number(dueDay) !== (society.dueDay ?? 10) ||
    Number(lateFeePct) !== (society.lateFeePct ?? 0)

  const save = async () => {
    setSaving(true)
    await onSave({
      name: name.trim() || society.name,
      address: address.trim(),
      defaultFee: Number(defaultFee) || 0,
      dueDay: Math.min(28, Math.max(1, Number(dueDay) || 10)),
      lateFeePct: Math.max(0, Number(lateFeePct) || 0),
    })
    setSaving(false)
    notify('Society profile saved.')
  }

  return (
    <div className="settings-grid">
      <div className="panel">
        <div className="panel-head"><div><h2>{society.kind === 'plaza' ? 'Plaza' : 'Society'} Profile</h2><p>Name and address shown across the workspace</p></div></div>
        <div className="form-grid" style={{ paddingTop: 14 }}>
          <label className="span-2">Name<input value={name} onChange={e => setName(e.target.value)} disabled={disabled} /></label>
          <label className="span-2">Address<input value={address} onChange={e => setAddress(e.target.value)} disabled={disabled} /></label>
          <label>Total units<input value={unitCount} disabled className="input-disabled" /></label>
          <label>Currency<input value="PKR" disabled className="input-disabled" /></label>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><h2>Billing defaults</h2><p>Used when generating monthly charges</p></div></div>
        <div className="form-grid" style={{ paddingTop: 14 }}>
          <label className="span-2">Default {society.kind === 'plaza' ? 'rent' : 'maintenance fee'} (PKR)<input type="number" min={0} value={defaultFee} onChange={e => setDefaultFee(e.target.value)} disabled={disabled} /></label>
          <label>Due day of month<input type="number" min={1} max={28} value={dueDay} onChange={e => setDueDay(e.target.value)} disabled={disabled} /></label>
          <label>Late fee (%)<input type="number" min={0} value={lateFeePct} onChange={e => setLateFeePct(e.target.value)} disabled={disabled} /></label>
        </div>
        <div className="modal-actions" style={{ padding: '0 24px 18px' }}>
          <Button size="sm" onClick={save} disabled={disabled || saving || !dirty}><CheckCircle2 data-icon="inline-start" />{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  )
}
