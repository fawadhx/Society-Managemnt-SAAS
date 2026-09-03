'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/admin'
import { PLANS, DEFAULT_EXTRA_SEAT_PRICE, type SubscriptionTier } from '@/lib/plans'

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

export default function CreateClientModal({ close, onCreated }: { close: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'society' | 'plaza'>('society')
  const [address, setAddress] = useState('')
  const [tier, setTier] = useState<SubscriptionTier>('TIER_1')
  const [extraSeats, setExtraSeats] = useState(0)
  const [billing, setBilling] = useState<'trial' | 'active'>('trial')
  const [trialDays, setTrialDays] = useState(14)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [close])

  const plan = PLANS[tier]
  const mrr = useMemo(() => plan.price + extraSeats * DEFAULT_EXTRA_SEAT_PRICE, [plan.price, extraSeats])
  const valid = name.trim() && adminEmail.includes('@') && adminPassword.length >= 8

  const submit = async () => {
    setBusy(true); setError('')
    try {
      await createClient({ name, kind, address, tier, extraSeats, billing, trialDays, adminName, adminEmail, adminPassword, logoUrl: logoUrl || undefined, primaryColor: primaryColor || undefined })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create client.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><p className="eyebrow">Provision</p><h2>New client</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
        <div className="form-grid">
          <label className="span-2">Client name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Green Valley Housing Society" /></label>
          <label>Kind<select value={kind} onChange={e => setKind(e.target.value as 'society' | 'plaza')}><option value="society">Society</option><option value="plaza">Plaza</option></select></label>
          <label>Tier<select value={tier} onChange={e => setTier(e.target.value as SubscriptionTier)}><option value="TIER_1">T1 Basic</option><option value="TIER_2">T2 Pro</option><option value="TIER_3">T3 Enterprise</option></select></label>
          <label className="span-2">Address<input value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional" /></label>
          <label>Included seats<input value={plan.includedSeats} disabled className="input-disabled" /></label>
          <label>Extra seats (+{fmt(DEFAULT_EXTRA_SEAT_PRICE)}/mo)<input type="number" min={0} value={extraSeats} onChange={e => setExtraSeats(Math.max(0, Number(e.target.value) || 0))} /></label>
          <label>Billing<select value={billing} onChange={e => setBilling(e.target.value as 'trial' | 'active')}><option value="trial">Trial</option><option value="active">Active (paid)</option></select></label>
          {billing === 'trial' && <label>Trial days<input type="number" min={1} value={trialDays} onChange={e => setTrialDays(Math.max(1, Number(e.target.value) || 14))} /></label>}
          <div className="charge-preview">
            <p className="preview-label">Monthly recurring</p>
            <div className="preview-row"><span>{plan.label}</span><strong>{fmt(plan.price)}</strong></div>
            {extraSeats > 0 && <div className="preview-row"><span>{extraSeats} extra seat{extraSeats > 1 ? 's' : ''}</span><strong>{fmt(extraSeats * DEFAULT_EXTRA_SEAT_PRICE)}</strong></div>}
            <div className="preview-row preview-total"><span>MRR</span><strong>{fmt(mrr)}</strong></div>
          </div>
          {tier === 'TIER_3' && <>
            <label>Logo URL<input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" /></label>
            <label>Brand colour<input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#117a72" /></label>
          </>}
          <label className="span-2" style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>First admin — name<input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="e.g. Arham Raza" /></label>
          <label>Admin email<input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@client.com" /></label>
          <label>Temp password<input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="min 8 chars" /></label>
        </div>
        {error && <p style={{ padding: '0 24px', margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
        <div className="modal-actions">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}><CheckCircle2 data-icon="inline-start" />{busy ? 'Creating…' : 'Create client'}</Button>
        </div>
      </div>
    </div>
  )
}
