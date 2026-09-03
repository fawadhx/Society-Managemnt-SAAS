'use client'

import { Eye, Pencil, Receipt, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { outstandingForUnit, residentForUnit, useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = {
  unitId: string
  close: () => void
  onEdit: () => void
  onViewResident: () => void
  onViewBilling: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="settings-row"><span className="settings-label">{label}</span><span className="settings-value">{children}</span></div>
}

export default function PropertyDetailModal({ unitId, close, onEdit, onViewResident, onViewBilling }: Props) {
  const { units, residents, invoices, payments } = useSociety()
  const unit = units.find(u => u.id === unitId)
  if (!unit) return null

  const occupied = unit.occupancy === 'Occupied'
  const resident = residentForUnit(unit.unitNumber, residents)
  const unitInvoices = invoices.filter(i => i.unitNumber === unit.unitNumber)
  const unitPayments = payments.filter(p => p.unitNumber === unit.unitNumber)
  const totalBilled = unitInvoices.reduce((sum, i) => sum + i.amount, 0)
  const totalPaid = unitInvoices.reduce((sum, i) => sum + (i.amount - i.outstanding), 0)
  const outstanding = outstandingForUnit(unit.unitNumber, invoices)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{occupied ? 'Occupied property' : 'Vacant property'}</p>
            <h2>{unit.unitNumber} — Block {unit.block}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <div style={{ padding: '18px 24px 0', display: 'grid', gap: 14 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '2px 14px' }}>
            <Row label="Unit number">{unit.unitNumber}</Row>
            <Row label="Type">{unit.type}</Row>
            <Row label="Block / Location">{`Block ${unit.block}`}</Row>
            <Row label="Monthly maintenance"><strong>{fmt(unit.monthlyCharge)}/mo</strong></Row>
            <Row label="Status"><span className={`status ${occupied ? 'status-occupied' : 'status-vacant'}`}><span className="status-dot" />{unit.occupancy}</span></Row>
            <Row label="Resident">{occupied ? (resident?.name ?? unit.ownerName ?? '—') : <span style={{ color: 'var(--muted-foreground)' }}>None</span>}</Row>
            {resident && <Row label="Resident phone">{resident.phone}</Row>}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '2px 14px' }}>
            <p className="eyebrow" style={{ padding: '10px 0 2px' }}>Billing summary</p>
            <Row label="Total billed">{fmt(totalBilled)}</Row>
            <Row label="Total paid">{fmt(totalPaid)}</Row>
            <Row label="Outstanding"><strong style={{ color: outstanding > 0 ? 'var(--danger)' : 'var(--primary)' }}>{fmt(outstanding)}</strong></Row>
            <Row label="Bills issued">{String(unitInvoices.length)}</Row>
            <Row label="Payments received">{String(unitPayments.length)}</Row>
          </div>
        </div>
        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8, paddingTop: 18 }}>
          <Button variant="outline" size="sm" onClick={onEdit}><Pencil data-icon="inline-start" />Edit property</Button>
          <Button variant="outline" size="sm" onClick={onViewBilling}><Receipt data-icon="inline-start" />View billing</Button>
          {occupied && <Button size="sm" onClick={onViewResident}><Eye data-icon="inline-start" />View resident</Button>}
        </div>
      </div>
    </div>
  )
}
