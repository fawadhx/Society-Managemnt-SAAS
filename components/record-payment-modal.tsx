'use client'

import { useMemo, useState, useCallback } from 'react'
import { CheckCircle2, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { residentForUnit, useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = { close: () => void; onSuccess: (msg: string) => void; initialUnit?: string }

export default function RecordPaymentModal({ close, onSuccess, initialUnit }: Props) {
  const { invoices, residents, recordPayment } = useSociety()
  const unpaid = useMemo(() => invoices.filter(i => i.status !== 'Paid' && i.outstanding > 0), [invoices])
  const preferred = initialUnit ? unpaid.find(i => i.unitNumber === initialUnit) : undefined
  const defaultInvoice = preferred ?? unpaid[0]

  const [invoiceId, setInvoiceId] = useState(defaultInvoice?.id ?? '')
  const [amount, setAmount] = useState(defaultInvoice?.outstanding.toString() ?? '')
  const [method, setMethod] = useState('Bank Transfer')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<'Confirmed' | 'Pending'>('Confirmed')
  const [sendWhatsApp, setSendWhatsApp] = useState(false)

  const selectedInvoice = invoices.find(i => i.id === invoiceId)
  // Receipts go to the resident currently attached to the unit.
  const selectedResident = selectedInvoice ? residentForUnit(selectedInvoice.unitNumber, residents) : undefined
  const parsedAmount = Number(amount) || 0
  const isValid = invoiceId && parsedAmount > 0 && parsedAmount <= (selectedInvoice?.outstanding ?? Infinity)

  const openWhatsApp = useCallback((residentName: string, phone: string, unitNumber: string, payAmount: number, remaining: number) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '')
    const message = encodeURIComponent(
      `Dear ${residentName}, we have received your payment of ${fmt(payAmount)} for Unit ${unitNumber}. Outstanding balance: ${fmt(remaining)}. Thank you.`
    )
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || !selectedInvoice) return
    const remaining = Math.max(0, selectedInvoice.outstanding - parsedAmount)
    await recordPayment(invoiceId, parsedAmount, method, date, status)
    if (status === 'Confirmed' && sendWhatsApp && selectedResident?.phone && selectedResident.phone !== '—') {
      openWhatsApp(selectedResident.name, selectedResident.phone, selectedInvoice.unitNumber, parsedAmount, remaining)
    }
    close()
    onSuccess(status === 'Pending'
      ? `Pending payment of ${fmt(parsedAmount)} logged — confirm it once the money clears.`
      : `Payment of ${fmt(parsedAmount)} recorded.${sendWhatsApp ? ' WhatsApp receipt opened.' : ''}`)
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
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="span-2">
              Status
              <select value={status} onChange={e => setStatus(e.target.value as 'Confirmed' | 'Pending')}>
                <option value="Confirmed">Confirmed — money received, apply to the bill now</option>
                <option value="Pending">Pending — awaiting clearance, don&apos;t reduce the bill yet</option>
              </select>
            </label>
          </div>
          {selectedResident?.phone && selectedResident.phone !== '—' && (
            <div style={{ padding: '0 24px', marginTop: -8, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)' }}>
                <input type="checkbox" checked={sendWhatsApp} onChange={e => setSendWhatsApp(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                <Send size={13} /> Send receipt via WhatsApp to {selectedResident.phone}
              </label>
            </div>
          )}
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!isValid}><CheckCircle2 data-icon="inline-start" />Save record</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
