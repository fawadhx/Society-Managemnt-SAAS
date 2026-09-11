'use client'

import { useState } from 'react'
import { X, Trash2, UserCheck, ArrowRightCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety, type Lead } from '@/lib/society-context'
import { useAuth } from '@/lib/auth-context'
import { LEAD_STATUSES, LEAD_STATUS_LABEL, LEAD_SOURCE_LABEL } from '@/lib/leads'

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

export default function LeadDetailModal({ lead, close, notify, onConvert }: {
  lead: Lead
  close: () => void
  notify: (m: string) => void
  onConvert: (lead: Lead) => void
}) {
  const { units, updateLead, deleteLead, assignLeadToMe, isReadOnly } = useSociety()
  const { user } = useAuth()
  const [notes, setNotes] = useState(lead.notes)
  const [budget, setBudget] = useState(lead.budget != null ? String(lead.budget) : '')
  const [unitId, setUnitId] = useState(lead.unitId ?? '')
  const [saving, setSaving] = useState(false)

  const mineLabel = lead.assignedTo
    ? (lead.assignedTo === user?.id ? 'Assigned to you' : 'Assigned')
    : 'Unassigned'

  const saveDetails = async () => {
    setSaving(true)
    await updateLead(lead.id, {
      notes,
      budget: budget.trim() === '' ? undefined : Number(budget) || 0,
      unitId: unitId || undefined,
    })
    setSaving(false)
    notify('Lead updated.')
    close()
  }

  const remove = async () => {
    if (!confirm(`Delete the lead "${lead.name}"? This cannot be undone.`)) return
    await deleteLead(lead.id)
    notify('Lead deleted.')
    close()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
      <div className="modal-head">
        <div>
          <p className="eyebrow">{LEAD_SOURCE_LABEL[lead.source]} lead · {new Date(lead.createdAt).toLocaleDateString()}</p>
          <h2>{lead.name}</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
      </div>

      <div className="form-grid">
        <label>Phone<input value={lead.phone || '—'} readOnly /></label>
        <label>Email<input value={lead.email || '—'} readOnly /></label>
        <label className="span-2">Interested in<input value={lead.unitPref || '—'} readOnly /></label>
        {lead.message && <label className="span-2">Their message<textarea value={lead.message} readOnly rows={3} /></label>}

        <label>Stage
          <select className="tier-select" value={lead.status} disabled={isReadOnly}
            onChange={e => { void updateLead(lead.id, { status: e.target.value as Lead['status'] }); notify('Stage updated.') }}>
            {LEAD_STATUSES.map(s => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label>Budget — PKR<input type="number" min={0} value={budget} onChange={e => setBudget(e.target.value)} placeholder="Optional" disabled={isReadOnly} /></label>

        <label className="span-2">Unit of interest
          <select value={unitId} onChange={e => setUnitId(e.target.value)} disabled={isReadOnly}>
            <option value="">— none —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber}{u.block ? ` — Block ${u.block}` : ''} · {fmt(u.monthlyCharge)}/mo · {u.occupancy}</option>)}
          </select>
        </label>

        <label className="span-2">Internal notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Call notes, follow-up dates, objections…" disabled={isReadOnly} /></label>

        <div className="span-2" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
          <span>{mineLabel}</span>
          {!isReadOnly && lead.assignedTo !== user?.id && (
            <button className="linkish" onClick={() => { void assignLeadToMe(lead.id); notify('Assigned to you.') }}>
              <UserCheck size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Assign to me
            </button>
          )}
        </div>
      </div>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="destructive" size="sm" onClick={remove} disabled={isReadOnly}><Trash2 data-icon="inline-start" />Delete</Button>
          {lead.status !== 'won' && (
            <Button variant="outline" size="sm" onClick={() => onConvert(lead)} disabled={isReadOnly}>
              <ArrowRightCircle data-icon="inline-start" />Convert to resident
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={close}>Close</Button>
          <Button onClick={saveDetails} disabled={saving || isReadOnly}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div></div>
  )
}
