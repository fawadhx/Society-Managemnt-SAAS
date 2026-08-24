'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = { close: () => void; onSuccess: (msg: string) => void }

export default function RecordPaymentModal({ close, onSuccess }: Props) {
  const { invoices, recordPayment } = useSociety()
  const unpaid = useMemo(() => invoices.filter(i => i.status !== 'Paid'), [invoices])

  const [invoiceId, setInvoiceId] = useState(unpaid[0]?.id ?? '')
  const [amount, setAmount] = useState(unpaid[0]?.outstanding.toString() ?? '')
  const [method, setMethod] = useState('Bank Transfer')
  const [date] = useState(() => {
    const d = new Date()
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`
  })

  const selectedInvoice = invoices.find(i => i.id === invoiceId)
  const parsedAmount = Number(amount) || 0
  const isValid = invoiceId && parsedAmount > 0 && parsedAmount <= (selectedInvoice?.outstanding ?? Infinity)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    recordPayment(invoiceId, parsedAmount, method)
    close()
    onSuccess(`Payment of ${fmt(parsedAmount)} recorded successfully.`)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Society workflow</p>
            <h2>Record a payment</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Select invoice
              <select value={invoiceId} onChange={e => {
                setInvoiceId(e.target.value)
                const inv = invoices.find(i => i.id === e.target.value)
                if (inv) setAmount(inv.outstanding.toString())
              }}>
                {unpaid.length === 0 && <option value="">No unpaid invoices</option>}
                {unpaid.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.unitNumber} — {i.residentName} — {i.period} ({fmt(i.outstanding)} due)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment method
              <select value={method} onChange={e => setMethod(e.target.value)}>
                <option>Bank Transfer</option>
                <option>JazzCash</option>
                <option>EasyPaisa</option>
                <option>Cash</option>
              </select>
            </label>
            <label>
              Payment amount (PKR)
              <input
                type="number"
                min={1}
                max={selectedInvoice?.outstanding}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 12,500"
              />
            </label>
            <label>
              Payment date
              <input type="text" value={date} readOnly />
            </label>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!isValid}><CheckCircle2 data-icon="inline-start" />Save record</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
