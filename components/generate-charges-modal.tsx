'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = { close: () => void; onSuccess: (msg: string) => void }

export default function GenerateChargesModal({ close, onSuccess }: Props) {
  const { units, generateMonthlyInvoices } = useSociety()
  const activeUnits = useMemo(() => units.filter(u => u.occupancy === 'Occupied'), [units])

  const [period, setPeriod] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toLocaleString('en', { month: 'long', year: 'numeric' })
  })
  const [fee, setFee] = useState('12500')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(10)
    return d.toISOString().slice(0, 10)
  })

  const parsedFee = Number(fee) || 0
  const totalRevenue = activeUnits.length * parsedFee
  const isValid = period.trim().length > 0 && parsedFee > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    generateMonthlyInvoices(period.trim(), parsedFee)
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
              Maintenance fee per unit (PKR)
              <input
                type="number"
                min={1}
                value={fee}
                onChange={e => setFee(e.target.value)}
                placeholder="12,500"
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
              <div className="preview-row"><span>Active units to bill</span><strong>{activeUnits.length}</strong></div>
              <div className="preview-row"><span>Fee per unit</span><strong>{fmt(parsedFee)}</strong></div>
              <div className="preview-row preview-total"><span>Total revenue</span><strong>{fmt(totalRevenue)}</strong></div>
            </div>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!isValid}><CheckCircle2 data-icon="inline-start" />Generate invoices</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
