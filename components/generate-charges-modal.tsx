'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = { close: () => void; onSuccess: (msg: string) => void }

export default function GenerateChargesModal({ close, onSuccess }: Props) {
  const { units, invoices, generateMonthlyInvoices } = useSociety()
  const activeUnits = useMemo(() => units.filter(u => u.occupancy === 'Occupied'), [units])

  // Every unit is billed its own monthly maintenance fee (its recurring charge).
  const combinedFees = useMemo(() => activeUnits.reduce((sum, u) => sum + (u.monthlyCharge || 0), 0), [activeUnits])
  const alreadyBilledPeriods = useMemo(() => new Set(invoices.map(i => i.period)), [invoices])

  const [period, setPeriod] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toLocaleString('en', { month: 'long', year: 'numeric' })
  })
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(10)
    return d.toISOString().slice(0, 10)
  })

  const totalRevenue = combinedFees
  const isValid = period.trim().length > 0 && activeUnits.length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    // Second argument is only a fallback for units without a custom fee —
    // each unit is billed its own monthlyCharge.
    generateMonthlyInvoices(period.trim(), Math.round(combinedFees / Math.max(1, activeUnits.length)), dueDate)
    close()
    onSuccess(`Generated ${activeUnits.length} invoices for ${period.trim()} — total ${fmt(totalRevenue)}.`)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Society workflow</p>
            <h2>Generate monthly charges</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Billing period
              <input
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder="e.g. September 2026"
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </label>
            <div className="charge-preview">
              <p className="preview-label">Preview</p>
              <div className="preview-row"><span>Occupied units to bill</span><strong>{activeUnits.length}</strong></div>
              <div className="preview-row"><span>Combined monthly fees</span><strong>{fmt(combinedFees)}</strong></div>
              {alreadyBilledPeriods.has(period.trim()) && <div className="preview-row" style={{ color: 'var(--warning)' }}><span>Units already billed for this period are skipped</span></div>}
              <div className="preview-row preview-total"><span>Total due</span><strong>{fmt(totalRevenue)}</strong></div>
            </div>
          </div>
          {activeUnits.length === 0 && (
            <p style={{ padding: '0 24px 12px', margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
              No occupied units to bill. Assign residents to vacant properties first.
            </p>
          )}
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!isValid}><CheckCircle2 data-icon="inline-start" />Generate invoices</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
