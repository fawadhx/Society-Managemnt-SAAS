'use client'

import { CircleDollarSign, LogOut, Pencil, Receipt, Send, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { outstandingForUnit, paymentStatusFor, residentForUnit, useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = {
  unitNumber: string
  close: () => void
  onSuccess?: (msg: string) => void
  onEdit: () => void
  onRecordPayment: () => void
  onViewBilling: () => void
  onCheckout: () => void
  onDeleted?: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="settings-row"><span className="settings-label">{label}</span><span className="settings-value">{children}</span></div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow" style={{ marginBottom: 6 }}>{title}</p>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '2px 14px' }}>{children}</div>
    </div>
  )
}

export default function ResidentDetailModal({ unitNumber, close, onSuccess, onEdit, onRecordPayment, onViewBilling, onCheckout, onDeleted }: Props) {
  const { residents, units, invoices, payments, overdueResidents, sendReminder, canSendAutomatedReminders, approveResident, reactivateResident, deleteResident } = useSociety()
  // Resolve the resident currently attached to the unit (not a historical record).
  const resident = residentForUnit(unitNumber, residents)
  const unit = units.find(u => u.unitNumber === unitNumber)
  if (!resident) return null

  const unitInvoices = invoices.filter(i => i.unitNumber === unitNumber)
  const unitPayments = payments.filter(p => p.unitNumber === unitNumber)
  const totalBilled = unitInvoices.reduce((sum, i) => sum + i.amount, 0)
  const totalPaid = unitInvoices.reduce((sum, i) => sum + (i.amount - i.outstanding), 0)
  const outstanding = outstandingForUnit(unitNumber, invoices)
  // No bills yet — there is no payment status to report.
  const payStatus = unitInvoices.length === 0 ? '—' : paymentStatusFor(unitNumber, invoices)
  const reminder = overdueResidents.find(o => o.unitNumber === unitNumber)

  const activity = [
    ...unitInvoices.map(i => ({ key: `inv-${i.id}`, label: `Bill · ${i.period}`, meta: i.outstanding <= 0 ? 'Paid' : `${fmt(i.outstanding)} outstanding`, amount: i.amount, date: i.dueDate })),
    ...unitPayments.map(p => ({ key: `pay-${p.id}`, label: `Payment · ${p.method}`, meta: p.receiptId, amount: p.amount, date: p.date })),
  ].slice(0, 6)

  const accountChip = resident.accountStatus === 'Active' ? 'status-occupied' : resident.accountStatus === 'Pending' ? 'status-pending' : 'status-inactive'
  const payChip = payStatus === 'Paid' ? 'status-paid' : payStatus === 'Overdue' ? 'status-overdue' : 'status-pending'
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" style={{ width: 'min(560px, 100%)' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Unit {unitNumber}{unit ? ` — Block ${unit.block}` : ''}</p>
            <h2>{resident.name}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <div style={{ padding: '18px 24px 0', display: 'grid', gap: 14 }}>
          <Section title="Resident">
            <Row label="Name">{resident.name}</Row>
            <Row label="Phone">{resident.phone}</Row>
            <Row label="Email">{resident.email || '—'}</Row>
            <Row label="Account status"><span className={`status ${accountChip}`}><span className="status-dot" />{resident.accountStatus}</span></Row>
          </Section>
          <Section title="Property">
            <Row label="Unit number">{unit?.unitNumber ?? unitNumber}</Row>
            <Row label="Block / Location">{unit ? `Block ${unit.block}` : '—'}</Row>
            <Row label="Monthly maintenance">{unit ? <strong>{fmt(unit.monthlyCharge)}/mo</strong> : '—'}</Row>
            <Row label="Occupancy"><span className={`status ${unit?.occupancy === 'Occupied' ? 'status-occupied' : 'status-vacant'}`}><span className="status-dot" />{unit?.occupancy ?? '—'}</span></Row>
          </Section>
          <Section title="Financial summary">
            <Row label="Current balance"><strong style={{ color: outstanding > 0 ? 'var(--danger)' : 'var(--primary)' }}>{fmt(outstanding)}</strong></Row>
            <Row label="Total billed">{fmt(totalBilled)}</Row>
            <Row label="Total paid">{fmt(totalPaid)}</Row>
            <Row label="Payment status">{payStatus === '—' ? <span style={{ color: 'var(--muted-foreground)' }}>No bills yet</span> : <span className={`status ${payChip}`}><span className="status-dot" />{payStatus}</span>}</Row>
            <Row label="Security deposit">{fmt(resident.securityDeposit ?? 0)}</Row>
            <Row label="Advance rent">{fmt(resident.advanceRent ?? 0)}</Row>
          </Section>
          <Section title="Recent activity">
            {activity.length === 0
              ? <p style={{ margin: '10px 0', fontSize: 12, color: 'var(--muted-foreground)' }}>No billing or payment activity yet.</p>
              : activity.map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 12, display: 'block' }}>{item.label}</strong>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{item.meta} · {item.date}</span>
                  </div>
                  <strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(item.amount)}</strong>
                </div>
              ))}
          </Section>
        </div>
        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: 8, paddingTop: 18 }}>
          {resident.accountStatus === 'Pending' && <Button size="sm" onClick={() => { approveResident(unitNumber); onSuccess?.(`${resident.name} approved — account is now Active`) }}><ShieldCheck data-icon="inline-start" />Approve resident</Button>}
          {resident.accountStatus === 'Inactive' && unit?.occupancy === 'Vacant' && <Button size="sm" onClick={() => { reactivateResident(unitNumber); onSuccess?.(`${resident.name} reactivated — Unit ${unitNumber} is Occupied again`) }}><UserCheck data-icon="inline-start" />Reactivate resident</Button>}
          <Button variant="outline" size="sm" onClick={onEdit}><Pencil data-icon="inline-start" />Edit</Button>
          <Button variant="outline" size="sm" onClick={onViewBilling}><Receipt data-icon="inline-start" />View billing</Button>
          {reminder && canSendAutomatedReminders && <Button variant="outline" size="sm" onClick={() => { void sendReminder(reminder.id); close() }}><Send data-icon="inline-start" />Send reminder</Button>}
          {resident.accountStatus !== 'Inactive' && <Button variant="outline" size="sm" onClick={onCheckout}><LogOut data-icon="inline-start" />Move out</Button>}
          {resident.accountStatus !== 'Inactive' && <Button size="sm" onClick={onRecordPayment}><CircleDollarSign data-icon="inline-start" />Record payment</Button>}
          <Button variant="destructive" size="sm" onClick={() => {
            if (!confirm(`Delete ${resident.name} from ${unitNumber}? This removes the resident record${resident.accountStatus !== 'Inactive' ? ' and frees the unit' : ''}. Billing history stays with the unit.`)) return
            void deleteResident(resident.id)
            onSuccess?.(`${resident.name} deleted from ${unitNumber}.`)
            ;(onDeleted ?? close)()
          }}><Trash2 data-icon="inline-start" />Delete</Button>
        </div>
      </div>
    </div>
  )
}
