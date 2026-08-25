'use client'

import { useMemo, useState, useCallback } from 'react'
import { CheckCircle2, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety } from '@/lib/society-context'

const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

type Props = { close: () => void; onSuccess: (msg: string) => void }

export default function RecordPaymentModal({ close, onSuccess }: Props) {
  const { invoices, residents, recordPayment } = useSociety()
  const unpaid = useMemo(() => invoices.filter(i => i.status !== 'Paid'), [invoices])

  const [invoiceId, setInvoiceId] = useState(unpaid[0]?.id ?? '')
  const [amount, setAmount] = useState(unpaid[0]?.outstanding.toString() ?? '')
  const [method, setMethod] = useState('Bank Transfer')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sendWhatsApp, setSendWhatsApp] = useState(false)

  const selectedInvoice = invoices.find(i => i.id === invoiceId)
  const selectedResident = selectedInvoice ? residents.find(r => r.unitNumber === selectedInvoice.unitNumber) : undefined
  const parsedAmount = Number(amount) || 0
  const isValid = invoiceId && parsedAmount > 0 && parsedAmount <= (selectedInvoice?.outstanding ?? Infinity)

  const openWhatsApp = useCallback((residentName: string, phone: string, unitNumber: string, payAmount: number, receiptNo: string, remaining: number) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '')
    const message = encodeURIComponent(
      `Dear ${residentName}, we have received your payment of ${fmt(payAmount)} for Unit ${unitNumber}. Receipt #${receiptNo}. Outstanding balance: ${fmt(remaining)}.`
    )
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank')
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || !selectedInvoice) return
    const remaining = Math.max(0, selectedInvoice.outstanding - parsedAmount)
    recordPayment(invoiceId, parsedAmount, method, date)
    const receiptNo = `REC-${Math.floor(Math.random() * 9000) + 1000}`
    if (sendWhatsApp && selectedResident?.phone && selectedResident.phone !== '—') {
      openWhatsApp(selectedResident.name, selectedResident.phone, selectedInvoice.unitNumber, parsedAmount, receiptNo, remaining)
    }
    close()
    onSuccess(`Payment of ${fmt(parsedAmount)} recorded successfully.${sendWhatsApp ? ' WhatsApp receipt sent.' : ''}`)
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
