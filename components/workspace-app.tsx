'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDownRight, ArrowUpRight, Bell, Building2, CalendarDays, ChevronDown, CircleDollarSign,
  CreditCard, FileText, HelpCircle, Home, LayoutDashboard, MoreHorizontal, Plus,
  Receipt, Search, Settings, ShieldCheck, Users, WalletCards, X, Send, Download, CheckCircle2,
  AlertCircle, Clock3, TrendingUp, Landmark, SlidersHorizontal, Lock, PanelLeftClose, PanelLeft, Pencil, Sun, Moon, Eye, UserPlus, UserCheck, LogOut,
  Globe, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety, invoiceDisplayStatus, outstandingForUnit, paymentStatusFor, residentForUnit, type Resident, type PaymentRecord } from '@/lib/society-context'
import { useAuth } from '@/lib/auth-context'
import { useSubscription } from '@/lib/subscription-context'
import { useTerms } from '@/lib/terms'
import RecordPaymentModal from '@/components/record-payment-modal'
import GenerateChargesModal from '@/components/generate-charges-modal'
import EditProfileModal from '@/components/edit-profile-modal'
import SocietySwitcherModal from '@/components/society-switcher-modal'
import NotificationsModal from '@/components/notifications-modal'
import ResidentDetailModal from '@/components/resident-detail-modal'
import PropertyDetailModal from '@/components/property-detail-modal'
import SocietyProfileForm from '@/components/society-profile-form'
import TeamPanel from '@/components/team-panel'
import LeadsView from '@/components/leads-view'
import WebsiteView from '@/components/website-view'
import type { AuditLog, Lead } from '@/lib/society-context'
import { seedCurrentSociety } from '@/lib/seed'
import { toCsv, downloadCsv } from '@/lib/csv'

type View = 'Dashboard' | 'Properties' | 'Residents' | 'Billing' | 'Payments' | 'Reminders' | 'Reports' | 'Leads' | 'Website' | 'Team' | 'Settings'
type Modal = 'charges' | 'payment' | 'reminder' | 'property' | 'resident' | 'editProperty' | 'editResident' | 'checkout' | 'residentDetail' | 'propertyDetail' | null

const nav: { label: View; icon: typeof Home; teamOnly?: boolean; t3Only?: boolean }[] = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Properties', icon: Building2 },
  { label: 'Residents', icon: Users }, { label: 'Billing', icon: Receipt },
  { label: 'Payments', icon: CreditCard }, { label: 'Reminders', icon: Bell },
  { label: 'Reports', icon: FileText },
  { label: 'Leads', icon: Sparkles, t3Only: true }, { label: 'Website', icon: Globe, t3Only: true },
  { label: 'Team', icon: UserPlus, teamOnly: true },
  { label: 'Settings', icon: Settings },
]
const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

function openWhatsAppReminder(name: string, phone: string, unitNumber: string, balance: number, org: string) {
  const clean = (phone || '').replace(/[^0-9+]/g, '')
  if (!clean || clean === '—') { alert('No phone number on file for this resident.'); return }
  const msg = encodeURIComponent(
    `Dear ${name}, this is a reminder from ${org} that Unit ${unitNumber} has an outstanding balance of ${fmt(balance)}. Kindly clear it at your earliest convenience. Thank you.`,
  )
  window.open(`https://wa.me/${clean}?text=${msg}`, '_blank')
}

function Status({ children }: { children: string }) {
  const tone = children === 'Paid' ? 'status-paid' : children === 'Active' ? 'status-active' : children === 'Overdue' ? 'status-overdue' : children === 'Occupied' ? 'status-occupied' : children === 'Vacant' ? 'status-vacant' : children === 'Inactive' ? 'status-inactive' : children === 'Due' || children === 'Pending' || children === 'Issued' ? 'status-pending' : 'status-partial'
  return <span className={`status ${tone}`}><span className="status-dot" />{children}</span>
}

function PropertyModal({ close, onSuccess }: { close: () => void; onSuccess: (msg: string) => void }) {
  const { addUnit, currentSociety, units } = useSociety()
  const [unitNumber, setUnitNumber] = useState('')
  const [block, setBlock] = useState('')
  const [monthlyCharge, setMonthlyCharge] = useState('12500')

  const duplicate = units.some(u => u.unitNumber.trim().toLowerCase() === unitNumber.trim().toLowerCase()) && unitNumber.trim().length > 0

  const handleSubmit = () => {
    if (!unitNumber.trim() || !block.trim() || duplicate) return
    addUnit(unitNumber.trim(), block.trim(), parseInt(monthlyCharge) || 12500)
    onSuccess(`Vacant unit ${unitNumber.trim()} created in ${currentSociety.name}`)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">Add new property</p><h2>Add a property</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    <div className="form-grid">
      <label>Unit number <input value={unitNumber} onChange={e => setUnitNumber(e.target.value)} placeholder="e.g. C-302" /></label>
      <label>Block / Location <input value={block} onChange={e => setBlock(e.target.value)} placeholder="e.g. C" /></label>
      <label>Monthly maintenance fee (PKR) <input value={monthlyCharge} onChange={e => setMonthlyCharge(e.target.value)} type="number" placeholder="12500" /></label>
    </div>
    <p className="modal-hint">{duplicate ? `Unit ${unitNumber.trim()} already exists — unit numbers must be unique.` : <>New properties default to <strong>Vacant</strong> status. Use &quot;Add Resident&quot; to assign an owner.</>}</p>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={!unitNumber.trim() || !block.trim() || duplicate}>
        <CheckCircle2 data-icon="inline-start" />Add property</Button>
    </div>
  </div></div>
}

function AddResidentModal({ initialUnit, prefill, close, onSuccess }: { initialUnit?: string; prefill?: { name: string; phone: string; email?: string }; close: () => void; onSuccess: (msg: string) => void }) {
  const { units, assignResident, currentSociety } = useSociety()
  const terms = useTerms()
  const vacantUnits = units.filter(u => u.occupancy === 'Vacant')
  const presetUnit = initialUnit && vacantUnits.some(u => u.unitNumber === initialUnit) ? initialUnit : vacantUnits[0]?.unitNumber ?? ''
  const [selectedUnit, setSelectedUnit] = useState(presetUnit)
  const [name, setName] = useState(prefill?.name ?? '')
  const [phone, setPhone] = useState(prefill?.phone ?? '')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const selectedUnitObj = units.find(u => u.unitNumber === selectedUnit)
  const rent = selectedUnitObj?.monthlyCharge ?? 0
  // Security deposit is entered as a number of months' rent (or a custom amount, or none).
  const [depositMode, setDepositMode] = useState<'none' | '1' | '2' | '3' | '6' | 'custom'>('1')
  const [customDeposit, setCustomDeposit] = useState('')
  const [billFirstMonth, setBillFirstMonth] = useState(true)
  const [paidNow, setPaidNow] = useState('')

  const securityDeposit = depositMode === 'none' ? 0
    : depositMode === 'custom' ? (Number(customDeposit) || 0)
    : rent * Number(depositMode)

  const firstMonthRent = billFirstMonth ? rent : 0
  const moveInTotal = securityDeposit + firstMonthRent
  // Nothing paid unless the admin enters an amount; capped so the tenant can never overpay.
  const paidNowNum = Math.max(0, Math.min(moveInTotal, Number(paidNow) || 0))
  const balanceDue = moveInTotal - paidNowNum

  const handleUnitChange = (unitNum: string) => setSelectedUnit(unitNum)

  const handleSubmit = () => {
    if (!selectedUnit || !name.trim()) return
    assignResident(selectedUnit, name.trim(), phone.trim(), {
      email: email.trim() || undefined,
      securityDeposit,
      billFirstMonth,
      paidAtMoveIn: paidNowNum,
    })
    onSuccess(balanceDue > 0
      ? `${name.trim()} assigned to ${selectedUnit}. Balance due ${fmt(balanceDue)}.`
      : `${name.trim()} assigned to ${selectedUnit}. Move-in paid in full.`)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">{prefill ? `Re-assigning ${prefill.name}` : 'Assign to vacant unit'}</p><h2>{prefill ? `Re-assign ${terms.resident}` : `Add ${terms.resident === 'tenant' ? 'a tenant' : 'a resident'}`}</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    {vacantUnits.length === 0 ? <div className="empty-state" style={{ padding: '32px 20px' }}><AlertCircle size={28} strokeWidth={1.5} color="var(--muted-foreground)" /><p style={{ margin: '8px 0 0', fontSize: 12 }}>No vacant units available. Create a property first.</p></div> : <>
    <div className="form-grid">
      <label className="span-2">Unit <select value={selectedUnit} onChange={e => handleUnitChange(e.target.value)}>{vacantUnits.map(u => <option key={u.id} value={u.unitNumber}>{u.unitNumber}{u.block ? ` — ${u.block}` : ''} · {fmt(u.monthlyCharge)}/mo</option>)}</select></label>
      <label>{terms.Resident} name <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ayesha Malik" /></label>
      <label>Phone number <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0300 1234567" /></label>
      <label className="span-2">Email <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" /></label>
      <label>Security deposit
        <select value={depositMode} onChange={e => setDepositMode(e.target.value as typeof depositMode)}>
          <option value="none">None</option>
          <option value="1">1 month{rent ? ` — ${fmt(rent)}` : ''}</option>
          <option value="2">2 months{rent ? ` — ${fmt(rent * 2)}` : ''}</option>
          <option value="3">3 months{rent ? ` — ${fmt(rent * 3)}` : ''}</option>
          <option value="6">6 months{rent ? ` — ${fmt(rent * 6)}` : ''}</option>
          <option value="custom">Custom amount</option>
        </select>
      </label>
      {depositMode === 'custom'
        ? <label>Custom deposit — PKR <input type="number" min={0} value={customDeposit} onChange={e => setCustomDeposit(e.target.value)} placeholder="0" /></label>
        : <label>Paid at move-in — PKR <input type="number" min={0} max={moveInTotal} value={paidNow} onChange={e => setPaidNow(e.target.value)} placeholder="0" /></label>}
      {depositMode === 'custom' && <label>Paid at move-in — PKR <input type="number" min={0} max={moveInTotal} value={paidNow} onChange={e => setPaidNow(e.target.value)} placeholder="0" /></label>}
      <label className="span-2" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={billFirstMonth} onChange={e => setBillFirstMonth(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
        Charge first month&apos;s {terms.fee} now
      </label>
      <div className="charge-preview span-2">
        <div className="preview-row"><span>Security deposit</span><strong>{fmt(securityDeposit)}</strong></div>
        {billFirstMonth && <div className="preview-row"><span>First month {terms.fee}</span><strong>{fmt(firstMonthRent)}</strong></div>}
        <div className="preview-row preview-total"><span>Move-in total</span><strong>{fmt(moveInTotal)}</strong></div>
        <div className="preview-row"><span>Paid at move-in</span><strong>− {fmt(paidNowNum)}</strong></div>
        <div className="preview-row preview-total"><span>Balance due</span><strong style={{ color: balanceDue > 0 ? 'var(--danger)' : 'var(--primary)' }}>{fmt(balanceDue)}</strong></div>
      </div>
    </div>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={!selectedUnit || !name.trim()}>
        <CheckCircle2 data-icon="inline-start" />Assign {terms.resident}</Button>
    </div>
    </>}</div></div>
}

function EditPropertyModal({ unitId, close, onSuccess }: { unitId: string; close: () => void; onSuccess: (msg: string) => void }) {
  const { units, updateUnit } = useSociety()
  const unit = units.find(u => u.id === unitId)
  const [block, setBlock] = useState(unit?.block ?? '')
  const [occupancy, setOccupancy] = useState<'Occupied' | 'Vacant'>(unit?.occupancy ?? 'Vacant')
  const [monthlyCharge, setMonthlyCharge] = useState(String(unit?.monthlyCharge ?? 12500))

  if (!unit) return null

  const handleSubmit = () => {
    updateUnit(unitId, {
      block: block.trim() || unit.block,
      occupancy,
      monthlyCharge: parseInt(monthlyCharge) || unit.monthlyCharge,
    })
    onSuccess(`Unit ${unit.unitNumber} updated`)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">{unit.unitNumber}</p><h2>Edit property</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    <div className="form-grid">
      <label>Block / Location <input value={block} onChange={e => setBlock(e.target.value)} /></label>
      <label>Occupancy <select value={occupancy} onChange={e => setOccupancy(e.target.value as 'Occupied' | 'Vacant')}><option value="Occupied">Occupied</option><option value="Vacant">Vacant</option></select></label>
      <label>Monthly fee (PKR) <input value={monthlyCharge} onChange={e => setMonthlyCharge(e.target.value)} type="number" /></label>
    </div>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit}><CheckCircle2 data-icon="inline-start" />Save changes</Button>
    </div>
  </div></div>
}

function EditResidentModal({ unitNumber, close, onSuccess }: { unitNumber: string; close: () => void; onSuccess: (msg: string) => void }) {
  const { residents, updateResident } = useSociety()
  const resident = residentForUnit(unitNumber, residents)
  const [name, setName] = useState(resident?.name ?? '')
  const [phone, setPhone] = useState(resident?.phone ?? '')
  const [email, setEmail] = useState(resident?.email ?? '')
  const [securityDeposit, setSecurityDeposit] = useState(String(resident?.securityDeposit ?? 0))
  const [advanceRent, setAdvanceRent] = useState(String(resident?.advanceRent ?? 0))
  const [accountStatus, setAccountStatus] = useState<import('@/lib/society-context').Resident['accountStatus']>(resident?.accountStatus ?? 'Pending')

  const handleSubmit = () => {
    if (!name.trim()) return
    updateResident(unitNumber, {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      securityDeposit: parseInt(securityDeposit) || 0,
      advanceRent: parseInt(advanceRent) || 0,
      accountStatus,
    })
    onSuccess(`${name.trim()} updated for ${unitNumber}`)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">{unitNumber}</p><h2>Edit resident</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    <div className="form-grid">
      <label>Resident name <input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Phone number <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0300 1234567" /></label>
      <label className="span-2">Email <input value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. ayesha@email.com (optional)" /></label>
      <label>Security deposit — PKR <input type="number" min={0} value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} /></label>
      <label>Advance rent — PKR <input type="number" min={0} value={advanceRent} onChange={e => setAdvanceRent(e.target.value)} /></label>
      <label className="span-2">Account status <select value={accountStatus} onChange={e => setAccountStatus(e.target.value as import('@/lib/society-context').Resident['accountStatus'])}><option value="Pending">Pending</option><option value="Active">Active</option><option value="Inactive">Inactive (moved out)</option></select></label>
    </div>
    <p className="modal-hint">Account status is separate from payments — financial status (Paid / Due / Overdue) is derived from billing. To vacate the unit, use <strong>Move out</strong> on the resident.</p>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={!name.trim()}><CheckCircle2 data-icon="inline-start" />Save changes</Button>
    </div>
  </div></div>
}

function CheckoutModal({ unitNumber, close, onSuccess }: { unitNumber: string; close: () => void; onSuccess: (msg: string) => void }) {
  const { residents, invoices, units, checkoutResident } = useSociety()
  const terms = useTerms()
  const resident = residentForUnit(unitNumber, residents)
  const unit = units.find(u => u.unitNumber === unitNumber)
  const deposit = resident?.securityDeposit ?? 0
  const advance = resident?.advanceRent ?? 0
  // Outstanding is always derived from the unit's bills — never a stored figure.
  const outstanding = outstandingForUnit(unitNumber, invoices)
  const rent = unit?.monthlyCharge ?? 0

  const [noticeGiven, setNoticeGiven] = useState(true)
  const [deductions, setDeductions] = useState('0')

  if (!resident) return null

  // Advance rent is never refunded — it settles the last month's / outstanding rent.
  const advanceApplied = Math.min(advance, outstanding)
  const remainingOutstanding = outstanding - advanceApplied
  // Security covers any rent the advance didn't; the rest is refundable / forfeitable.
  const securityToRent = Math.min(deposit, remainingOutstanding)
  const securityRemaining = deposit - securityToRent
  const appliedToRent = advanceApplied + securityToRent
  const stillOwed = Math.max(0, remainingOutstanding - securityToRent)

  // Gave notice → refund security minus verified damage deductions.
  // Left without notice → whole remaining security is forfeited, no refund.
  const ded = noticeGiven ? Math.max(0, Math.min(Number(deductions) || 0, securityRemaining)) : securityRemaining
  const refund = noticeGiven ? securityRemaining - ded : 0

  const row = (label: string, value: string, tone?: string, strong = true) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {strong ? <strong style={tone ? { color: tone } : undefined}>{value}</strong> : <span style={tone ? { color: tone } : undefined}>{value}</span>}
    </div>
  )

  const complete = () => {
    checkoutResident(unitNumber, { noticeGiven, deductions: ded })
    onSuccess(
      refund > 0
        ? `${resident.name} moved out. Refund ${fmt(refund)} to the ${terms.resident} after damage verification. ${unitNumber} is now vacant.`
        : `${resident.name} moved out${noticeGiven ? '' : ' without notice — security forfeited'}. ${unitNumber} is now vacant.`,
    )
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}><div className="modal-card" onClick={e => e.stopPropagation()}>
    <div className="modal-head"><div><p className="eyebrow">Move out · {unitNumber}</p><h2>Settle &amp; vacate — {resident.name}</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setNoticeGiven(true)} style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${noticeGiven ? 'var(--primary)' : 'var(--border)'}`, background: noticeGiven ? 'var(--secondary)' : '#fff', color: noticeGiven ? 'var(--primary)' : 'var(--foreground)' }}>Gave notice</button>
        <button onClick={() => setNoticeGiven(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!noticeGiven ? 'var(--danger)' : 'var(--border)'}`, background: !noticeGiven ? '#fbeeee' : '#fff', color: !noticeGiven ? 'var(--danger)' : 'var(--foreground)' }}>Left without notice</button>
      </div>

      {noticeGiven ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 16 }}>
          Damage deductions from security (PKR) — after inspecting the unit
          <input type="number" min={0} max={securityRemaining} value={deductions} onChange={e => setDeductions(e.target.value)} style={{ border: '1px solid var(--input)', borderRadius: 6, padding: '9px 10px', fontSize: 12 }} />
        </label>
      ) : (
        <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Left without notice — the remaining security is forfeited and nothing is refunded.</p>
      )}

      <div style={{ background: 'var(--muted)', borderRadius: 8, padding: '10px 14px' }}>
        {row('Monthly rent', fmt(rent), undefined, false)}
        {row('Security deposit held', fmt(deposit))}
        {advance > 0 && row('Advance rent held', fmt(advance))}
        {outstanding > 0 && row('Outstanding rent', fmt(outstanding), 'var(--danger)')}
        {advanceApplied > 0 && row('Advance applied to rent', `− ${fmt(advanceApplied)}`)}
        {securityToRent > 0 && row('Security applied to rent', `− ${fmt(securityToRent)}`)}
        {row(noticeGiven ? 'Damage deductions' : 'Security forfeited', ded > 0 ? `− ${fmt(ded)}` : '—')}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
          {row('Refund to ' + terms.resident, fmt(refund), refund > 0 ? 'var(--primary)' : undefined)}
          {stillOwed > 0 && row('Still owed after deposit', fmt(stillOwed), 'var(--danger)')}
        </div>
      </div>
      {noticeGiven && refund > 0 && <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>Release the refund only after the unit passes inspection.</p>}
    </div>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={complete}><CheckCircle2 data-icon="inline-start" />Complete move-out</Button>
    </div>
  </div></div>
}

export default function WorkspaceApp() {
  const { residents: ctxResidents, payments: ctxPayments, overdueResidents: ctxOverdue, units, currentTier, adminName, currentSociety, requestPlanChange, myAccess, canManageTeam, convertLead } = useSociety()
  const { signOut, isSuperAdmin, viewingSocietyId, exitSocietyView } = useAuth()
  const subInfo = useSubscription()
  const brandName = currentSociety.name || 'Society Manager'
  const [view, setView] = useState<View>('Dashboard'); const [mobileNav, setMobileNav] = useState(false); const [modal, setModal] = useState<Modal>(null); const [notice, setNotice] = useState(''); const [query, setQuery] = useState(''); const [trend, setTrend] = useState<'collection' | 'outstanding'>('collection'); const [profileModal, setProfileModal] = useState(false); const [societyModal, setSocietyModal] = useState(false); const [notificationsModal, setNotificationsModal] = useState(false);  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); const [theme, setTheme] = useState<'light' | 'dark'>('light'); const [editingUnit, setEditingUnit] = useState<string | null>(null); const [editingResident, setEditingResident] = useState<string | null>(null); const [paymentUnit, setPaymentUnit] = useState<string | null>(null); const [residentUnit, setResidentUnit] = useState<string | null>(null); const [detailUnit, setDetailUnit] = useState<string | null>(null); const [propertyDetailId, setPropertyDetailId] = useState<string | null>(null); const [residentPrefill, setResidentPrefill] = useState<{ name: string; phone: string; email?: string } | null>(null); const [pendingLeadId, setPendingLeadId] = useState<string | null>(null)

  // Row shape: [unitNumber, name, phone, residentId] — the id lets the table
  // resolve the exact resident record even when a unit has move-out history.
  const residentRows = useMemo(() => ctxResidents.map(r => [r.unitNumber, r.name, r.phone, r.id]), [ctxResidents])
  const paymentRows = useMemo(() => ctxPayments.filter(p => p.status !== 'Pending').map(p => [p.receiptId, p.residentName, p.unitNumber, fmt(p.amount), p.date, p.method]), [ctxPayments])
  const filteredResidentRows = useMemo(() => residentRows.filter(row => row.join(' ').toLowerCase().includes(query.toLowerCase())), [query, residentRows])

  const router = useRouter()
  const open = (value: Exclude<Modal, null>) => { setPaymentUnit(null); setResidentUnit(null); setModal(value) }
  const openPaymentFor = (unitNumber: string | null) => { setPaymentUnit(unitNumber); setModal('payment') }
  const openResidentFor = (unitNumber: string | null) => { setResidentUnit(unitNumber); setModal('resident') }
  const notify = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 3000) }
  useEffect(() => { setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light') }, [])

  const reminderCount = ctxOverdue.length + ctxPayments.filter(p => p.status === 'Pending').length
  const anyModalOpen = modal !== null || profileModal || societyModal || notificationsModal
  useEffect(() => {
    if (!anyModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setModal(null); setPaymentUnit(null); setResidentUnit(null); setEditingUnit(null); setEditingResident(null); setDetailUnit(null); setPropertyDetailId(null)
      setProfileModal(false); setSocietyModal(false); setNotificationsModal(false)
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [anyModalOpen])
  const toggleTheme = () => setTheme(prev => {
    const next = prev === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    try { localStorage.setItem('sm-theme', next) } catch { /* noop */ }
    return next
  })
  return <div className="app-shell">
    {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-hidden="true" />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="brand"><div className="brand-mark">{currentSociety.logoUrl ? <img src={currentSociety.logoUrl} alt="" style={{ width: 19, height: 19, objectFit: 'contain' }} /> : <Building2 size={19} />}</div><span className="brand-text">{brandName}</span></div>
      <div className="society-switch clickable" onClick={() => setSocietyModal(true)}><div className="society-icon"><Home size={16} /></div><div><small>Current {currentSociety.kind === 'plaza' ? 'plaza' : 'society'}</small><strong>{brandName.split(' ').slice(0, 3).join(' ')}</strong></div><ChevronDown size={15} /></div>
      <p className="nav-label">Workspace</p><nav>{nav.filter(n => !n.teamOnly || canManageTeam).map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'nav-item active' : 'nav-item'} onClick={() => { setView(label); setMobileNav(false) }} title={sidebarCollapsed ? label : undefined}><Icon size={18} /><span className="nav-label-text">{label}</span>{label === 'Reminders' && reminderCount > 0 && <span className="nav-count">{reminderCount}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        {isSuperAdmin && <button className="nav-item" onClick={() => { exitSocietyView(); router.push('/admin') }} title={sidebarCollapsed ? 'Back to admin' : undefined}><ShieldCheck size={18} /><span className="nav-label-text">Back to admin</span></button>}
        <button className="nav-item" onClick={() => signOut().then(() => router.push('/login'))} title={sidebarCollapsed ? 'Sign out' : undefined}><LogOut size={18} /><span className="nav-label-text">Sign out</span></button>
        <div className="profile clickable" onClick={() => setProfileModal(true)} title={sidebarCollapsed ? `${adminName}` : 'Edit profile'}><div className="avatar">{adminName.split(' ').map(n => n[0]).join('').toUpperCase()}</div><div className="profile-info"><strong>{adminName}</strong><small>{isSuperAdmin ? 'Super Admin' : 'Administrator'}</small></div><MoreHorizontal size={17} className="profile-more" /></div>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-button" onClick={() => { if (window.matchMedia('(max-width: 720px)').matches) setMobileNav(v => !v); else setSidebarCollapsed(s => !s) }} aria-label="Toggle sidebar" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{mobileNav || sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}</button><div className="crumb"><span>{brandName}</span><b>/</b><strong>{view}</strong></div></div><div className="top-actions"><button className="icon-button" onClick={toggleTheme} aria-label="Toggle dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><span className="tier-current-badge" title={`${subInfo.seatsUsed}/${subInfo.seatsTotal} seats used`}>{currentTier === 'TIER_1' ? 'T1 Basic' : currentTier === 'TIER_2' ? 'T2 Pro' : 'T3 Enterprise'} · {subInfo.seatsUsed}/{subInfo.seatsTotal}</span><div className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${view.toLowerCase()}...`} /></div><button className="icon-button notification" aria-label="Notifications" onClick={() => setNotificationsModal(true)}><Bell size={18} />{reminderCount > 0 && <i />}</button><div className="top-avatar clickable" onClick={() => setProfileModal(true)} title="Edit profile">{adminName.split(' ').map(n => n[0]).join('').toUpperCase()}</div></div></header>
      <div className="page-wrap">
        {notice && <div className="toast"><CheckCircle2 size={17} />{notice}</div>}
        {isSuperAdmin && viewingSocietyId && <div className="plan-banner plan-banner-admin"><ShieldCheck size={15} />Viewing <strong>{brandName}</strong> as Super Admin. <button className="linkish" onClick={() => { exitSocietyView(); router.push('/admin') }}>Exit</button></div>}
        {subInfo.isReadOnly && <div className="plan-banner plan-banner-danger"><Lock size={15} />This workspace is <strong>read-only</strong> — the subscription is {subInfo.status}. Contact your provider to reactivate.</div>}
        {!subInfo.isReadOnly && myAccess === 'viewer' && <div className="plan-banner plan-banner-admin"><Eye size={15} />You have <strong>view-only</strong> access. Ask the workspace owner for edit rights.</div>}
        {!subInfo.isReadOnly && subInfo.status === 'trialing' && <div className="plan-banner plan-banner-warn"><Clock3 size={15} />Trial — <strong>{subInfo.daysLeftInTrial} day{subInfo.daysLeftInTrial === 1 ? '' : 's'} left</strong>. {!isSuperAdmin && <button className="linkish" onClick={() => { void requestPlanChange('tier', 'Activate subscription'); notify('Activation request sent to your provider.') }}>Request activation</button>}</div>}
        {!subInfo.isReadOnly && subInfo.status === 'past_due' && <div className="plan-banner plan-banner-warn"><AlertCircle size={15} />Payment overdue — please settle with your provider to avoid interruption.</div>}
        {view === 'Dashboard' ? <Dashboard trend={trend} setTrend={setTrend} open={open} /> : <SectionView view={view} query={query} filteredResidentRows={filteredResidentRows} paymentRows={paymentRows} open={open} notify={notify} onNavigate={setView} onViewResident={(unitNum) => { setDetailUnit(unitNum); setModal('residentDetail') }} onViewProperty={(unitId) => { setPropertyDetailId(unitId); setModal('propertyDetail') }} onRecordPayment={openPaymentFor} onEditUnit={(id) => { setEditingUnit(id); setModal('editProperty') }} onEditResident={(unitNum) => { setEditingResident(unitNum); setModal('editResident') }} onCheckout={(unitNum) => { setEditingResident(unitNum); setModal('checkout') }} onReassign={(r) => { setResidentPrefill({ name: r.name, phone: r.phone, email: r.email }); setResidentUnit(null); setModal('resident') }} onConvertLead={(lead) => { setResidentPrefill({ name: lead.name, phone: lead.phone, email: lead.email }); setResidentUnit(null); setPendingLeadId(lead.id); setModal('resident') }} />}
      </div>
    </main>
    {modal === 'payment' && <RecordPaymentModal initialUnit={paymentUnit ?? undefined} close={() => { setModal(null); setPaymentUnit(null) }} onSuccess={(msg) => { setModal(null); setPaymentUnit(null); notify(msg) }} />}
    {modal === 'charges' && <GenerateChargesModal close={() => setModal(null)} onSuccess={(msg) => { setModal(null); notify(msg) }} />}
    {modal === 'property' && <PropertyModal close={() => setModal(null)} onSuccess={(msg) => { setModal(null); notify(msg) }} />}
    {modal === 'resident' && <AddResidentModal initialUnit={residentUnit ?? undefined} prefill={residentPrefill ?? undefined} close={() => { setModal(null); setResidentUnit(null); setResidentPrefill(null); setPendingLeadId(null) }} onSuccess={(msg) => { setModal(null); setResidentUnit(null); setResidentPrefill(null); if (pendingLeadId) { void convertLead(pendingLeadId); setPendingLeadId(null); notify('Lead converted — resident added.') } else { notify(msg) } }} />}
    {modal === 'editProperty' && editingUnit && <EditPropertyModal unitId={editingUnit} close={() => { setModal(null); setEditingUnit(null) }} onSuccess={(msg) => { setModal(null); setEditingUnit(null); notify(msg) }} />}
    {modal === 'editResident' && editingResident && <EditResidentModal unitNumber={editingResident} close={() => { setModal(null); setEditingResident(null) }} onSuccess={(msg) => { setModal(null); setEditingResident(null); notify(msg) }} />}
    {modal === 'checkout' && editingResident && <CheckoutModal unitNumber={editingResident} close={() => { setModal(null); setEditingResident(null) }} onSuccess={(msg) => { setModal(null); setEditingResident(null); notify(msg) }} />}
    {modal === 'residentDetail' && detailUnit && <ResidentDetailModal unitNumber={detailUnit} close={() => { setModal(null); setDetailUnit(null) }} onSuccess={(msg) => notify(msg)} onEdit={() => { setEditingResident(detailUnit); setModal('editResident') }} onRecordPayment={() => openPaymentFor(detailUnit)} onViewBilling={() => { setModal(null); setDetailUnit(null); setView('Billing') }} onCheckout={() => { setEditingResident(detailUnit); setModal('checkout') }} onDeleted={() => { setModal(null); setDetailUnit(null) }} />}
    {modal === 'propertyDetail' && propertyDetailId && <PropertyDetailModal unitId={propertyDetailId} close={() => { setModal(null); setPropertyDetailId(null) }} onEdit={() => { setEditingUnit(propertyDetailId); setModal('editProperty') }} onViewResident={() => { const u = units.find(x => x.id === propertyDetailId); if (u) { setDetailUnit(u.unitNumber); setModal('residentDetail') } }} onViewBilling={() => { setModal(null); setPropertyDetailId(null); setView('Billing') }} />}
    {profileModal && <EditProfileModal close={() => setProfileModal(false)} onSuccess={(msg) => { setProfileModal(false); notify(msg) }} />}
    {societyModal && <SocietySwitcherModal close={() => setSocietyModal(false)} onSuccess={(msg) => { setSocietyModal(false); notify(msg) }} />}
    {notificationsModal && <NotificationsModal close={() => setNotificationsModal(false)} />}
  </div>
}

function Dashboard({ trend, setTrend, open }: { trend: 'collection' | 'outstanding'; setTrend: (v: 'collection' | 'outstanding') => void; open: (v: Exclude<Modal, null>) => void }) {
  const { units, residents, payments: ctxPayments, invoices: ctxInvoices, overdueResidents: ctxOverdue, canBatchGenerate, canSendAutomatedReminders, currentTier, adminName, currentSociety, stats } = useSociety()
  const terms = useTerms()
  const paymentRows = useMemo(() => ctxPayments.filter(p => p.status !== 'Pending').map(p => [p.receiptId, p.residentName, p.unitNumber, fmt(p.amount), p.date, p.method]), [ctxPayments])
  const series = useMemo(() => {
    const m = new Map<string, { period: string; billed: number; collected: number; outstanding: number }>()
    for (const i of ctxInvoices) {
      const e = m.get(i.period) ?? { period: i.period, billed: 0, collected: 0, outstanding: 0 }
      e.billed += i.amount; e.outstanding += i.outstanding; e.collected += i.amount - i.outstanding
      m.set(i.period, e)
    }
    return [...m.values()]
      .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())
      .slice(-6)
      .map(e => ({ ...e, label: (new Date(e.period).toLocaleString('en', { month: 'short' }) || e.period).slice(0, 3) }))
  }, [ctxInvoices])
  const [todayLabel, setTodayLabel] = useState('')
  useEffect(() => { setTodayLabel(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) }, [])

  return <><div className="page-heading"><div><p className="eyebrow">{todayLabel}</p><h1>Welcome back, {adminName.split(' ')[0]}</h1><p className="muted">Here&apos;s what&apos;s happening with your {terms.org} today.</p></div><div className="heading-actions"><Button variant="outline" disabled={!canSendAutomatedReminders} onClick={() => open('reminder')}><Send data-icon="inline-start" />Send reminder{!canSendAutomatedReminders && <span className="upgrade-hint">Upgrade to T2</span>}</Button><Button disabled={!canBatchGenerate} onClick={() => open('charges')}><Plus data-icon="inline-start" />Generate charges{!canBatchGenerate && <span className="upgrade-hint">Upgrade to T2</span>}</Button><span className="tier-current-badge">{currentTier === 'TIER_1' ? 'T1 Basic' : currentTier === 'TIER_2' ? 'T2 Pro' : 'T3 Enterprise'}</span></div></div>
    <div className="kpi-grid"><Kpi title="Total collection" value={fmt(stats.totalCollection)} change={`${stats.collectionRate}% of billed`} icon={CircleDollarSign} color="teal" /><Kpi title="Outstanding balance" value={fmt(stats.totalOutstanding)} change={stats.overdueCount > 0 ? `${stats.overdueCount} overdue accounts` : 'Nothing overdue'} icon={WalletCards} color="amber" down /><Kpi title="Collection rate" value={`${stats.collectionRate}%`} change={`${stats.paidInvoiceCount}/${stats.totalInvoiceCount} bills paid`} icon={TrendingUp} color="blue" /><Kpi title="Overdue accounts" value={String(stats.overdueCount)} change={stats.overdueCount > 0 ? `${stats.overdueCount} active` : 'None'} icon={AlertCircle} color={stats.overdueCount > 0 ? 'red' : 'teal'} down={stats.overdueCount > 0} /></div>
    <div className="kpi-grid"><Kpi title="Total properties" value={String(units.length)} change={`${stats.occupiedUnits} occupied · ${stats.vacantUnits} vacant`} icon={Building2} color="teal" /><Kpi title="Occupied units" value={String(stats.occupiedUnits)} change={units.length > 0 ? `${Math.round((stats.occupiedUnits / Math.max(1, units.length)) * 100)}% occupancy` : '—'} icon={Home} color="blue" /><Kpi title="Vacant units" value={String(stats.vacantUnits)} change={stats.vacantUnits > 0 ? 'Available to assign' : 'None vacant'} icon={WalletCards} color="amber" down={stats.vacantUnits > 0} /><Kpi title="Active residents" value={String(stats.activeResidents)} change={`${residents.filter(r => r.accountStatus === 'Pending').length} pending activation`} icon={Users} color="teal" /></div>
    <div className="tier-info-bar"><ShieldCheck size={14} /><span><strong>{currentTier === 'TIER_1' ? 'T1 Basic' : currentTier === 'TIER_2' ? 'T2 Pro' : 'T3 Enterprise'}</strong> plan active — {currentTier === 'TIER_1' ? 'Batch billing & automated reminders locked' : currentTier === 'TIER_2' ? 'Multi-society & audit logs locked' : 'All features unlocked'}</span></div>
    <div className="dashboard-grid"><section className="panel trend-panel"><div className="panel-head"><div><h2>Collection overview</h2><p>Monthly financial performance</p></div><div className="toggle"><button className={trend === 'collection' ? 'selected' : ''} onClick={() => setTrend('collection')}>Collected</button><button className={trend === 'outstanding' ? 'selected' : ''} onClick={() => setTrend('outstanding')}>Outstanding</button></div></div><div className="chart-meta"><strong>{trend === 'collection' ? fmt(stats.totalCollection) : fmt(stats.totalOutstanding)}</strong><span className="positive">{trend === 'collection' ? `${stats.collectionRate}% of billed collected` : `${fmt(stats.totalOutstanding)} still outstanding`}</span></div>
      {series.length === 0 ? <div className="empty-state" style={{ padding: '46px 20px' }}><TrendingUp size={30} strokeWidth={1.5} color="var(--muted-foreground)" /><p style={{ margin: '8px 0 0', fontSize: 12 }}>Not enough billing history yet — generate charges for a couple of months to see trends.</p></div> : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 200, padding: '18px 22px 0' }}>
          {series.map(s => { const max = Math.max(...series.map(x => x.billed), 1); const val = trend === 'collection' ? s.collected : s.outstanding; return (
            <div key={s.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: '100%', height: 150, display: 'flex', alignItems: 'flex-end' }} title={`${s.period} — billed ${fmt(s.billed)}, collected ${fmt(s.collected)}, outstanding ${fmt(s.outstanding)}`}>
                <div style={{ width: '100%', borderRadius: '6px 6px 0 0', background: 'var(--primary)', opacity: trend === 'collection' ? 1 : 0.55, height: `${Math.max(3, (val / max) * 100)}%` }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{s.label}</span>
            </div>
          ) })}
        </div>
      )}</section>
      <section className="panel breakdown"><div className="panel-head"><div><h2>Payment status</h2><p>{stats.totalInvoiceCount > 0 ? `${stats.totalInvoiceCount} invoices across society` : 'No invoices yet'}</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="donut-wrap"><div className="donut" style={{ background: stats.totalInvoiceCount > 0 ? `conic-gradient(var(--primary) 0 ${stats.paidPercent}%, var(--warning) ${stats.paidPercent}% ${stats.paidPercent + stats.partialPercent}%, var(--danger) ${stats.paidPercent + stats.partialPercent}% 100%)` : 'var(--border)' }}><div><strong>{stats.totalInvoiceCount}</strong><span>Invoices</span></div></div><div className="legend"><Legend color="var(--primary)" label="Paid" value={`${stats.paidPercent}%`} /><Legend color="var(--warning)" label="Partial" value={`${stats.partialPercent}%`} /><Legend color="var(--danger)" label="Overdue" value={`${stats.overduePercent}%`} /></div></div><div className="breakdown-foot"><span><CheckCircle2 size={15} />{stats.paidInvoiceCount} paid</span><span><Clock3 size={15} />{stats.totalInvoiceCount - stats.paidInvoiceCount - stats.overdueInvoiceCount} pending</span></div></section></div>
    <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h2>Recent payments</h2><p>Latest transactions across {currentSociety.name.split(' ')[0]} {currentSociety.name.split(' ')[1]}</p></div><Button variant="ghost" size="sm" onClick={() => open('payment')}>View all <ArrowUpRight data-icon="inline-end" /></Button></div><DataTable headers={['Receipt', 'Resident', 'Unit', 'Amount', 'Date', 'Method']} rows={paymentRows} /></section><section className="panel attention"><div className="panel-head"><div><h2>Needs attention</h2><p>Accounts that need follow-up</p></div><span className="count-badge">{ctxOverdue.length}</span></div>{ctxOverdue.length === 0 ? <div className="empty-state" style={{ padding: '24px 20px' }}><AlertCircle size={28} strokeWidth={1.5} color="var(--muted-foreground)" /><p style={{ margin: '8px 0 0', fontSize: 12 }}>No overdue accounts — all residents are up to date.</p></div> : ctxOverdue.slice(0, 3).map(item => <div className="attention-row" key={item.id}><div className="unit-avatar">{item.unitNumber.slice(0, 1)}</div><div className="attention-name"><strong>{item.name}</strong><span>{item.unitNumber} · {item.daysOverdue} days overdue</span></div><strong className="amount">{fmt(item.balance)}</strong><button className="small-send" onClick={() => open('reminder')} aria-label={`Remind ${item.name}`}><Send size={14} /></button></div>)}<Button variant="outline" className="full-button" onClick={() => open('reminder')}>View all reminders</Button></section></div>
  </>
}
function Kpi({ title, value, change, icon: Icon, color, down }: { title: string; value: string; change: string; icon: typeof Home; color: string; down?: boolean }) { return <div className="kpi"><div className={`kpi-icon ${color}`}><Icon size={19} /></div><p>{title}</p><strong>{value}</strong><span className={down ? 'change positive' : 'change'}>{down ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}<em style={{ fontStyle: 'normal', color: 'var(--muted-foreground)' }}>{change}</em></span></div> }
function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div className="legend-row"><span className="legend-dot" style={{ background: color }} /><span>{label}</span><strong>{value}</strong></div> }
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="table-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} style={{ color: 'var(--muted-foreground)' }}>Nothing yet.</td></tr> : rows.map((row, ri) => <tr key={row[0] ?? ri}>{row.map((cell, i) => <td key={i}>{i === 1 || i === 3 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table></div> }


function ResidentsView({ query, notify, onAdd, onView, onEdit, onRecordPayment, onCheckout, onReassign }: {
  query: string; notify: (m: string) => void; onAdd: () => void;
  onView: (u: string) => void; onEdit: (u: string) => void; onRecordPayment: (u: string | null) => void;
  onCheckout: (u: string) => void; onReassign: (r: { name: string; phone: string; email?: string }) => void
}) {
  const { residents, invoices, payments, units, currentSociety, approveResident, reactivateResident, deleteResident, isReadOnly } = useSociety()
  const terms = useTerms()
  const [tab, setTab] = useState<'active' | 'past'>('active')

  const q = query.trim().toLowerCase()
  const match = (r: Resident) => !q || `${r.name} ${r.phone} ${r.unitNumber} ${r.email ?? ''}`.toLowerCase().includes(q)
  const active = residents.filter(r => r.accountStatus !== 'Inactive' && match(r))
  const past = residents.filter(r => r.accountStatus === 'Inactive' && match(r))
    .sort((a, b) => new Date(b.movedOutAt ?? 0).getTime() - new Date(a.movedOutAt ?? 0).getTime())
  const paidDuringStay = (r: Resident) => payments.filter(p => p.unitNumber === r.unitNumber && p.residentName === r.name).reduce((s, p) => s + p.amount, 0)

  const pendingCount = residents.filter(r => r.accountStatus === 'Pending').length
  const activeCount = residents.filter(r => r.accountStatus === 'Active').length
  const inactiveCount = residents.filter(r => r.accountStatus === 'Inactive').length

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{currentSociety.name}</p><h1>{terms.Residents}</h1><p className="muted">Current and past {terms.residents} across your {terms.org}.</p></div>
      <Button disabled={isReadOnly} onClick={onAdd}><Plus data-icon="inline-start" />Add {terms.resident}</Button>
    </div>
    <div className="sub-kpis">
      <Kpi title={`Active ${terms.residents}`} value={String(activeCount)} change={`${pendingCount} pending approval`} icon={Users} color="teal" />
      <Kpi title={`Past ${terms.residents}`} value={String(inactiveCount)} change="Moved out — history kept" icon={LogOut} color="blue" />
      <Kpi title="Left without notice" value={String(residents.filter(r => r.accountStatus === 'Inactive' && r.leftWithNotice === false).length)} change="Of all past records" icon={AlertCircle} color="amber" down />
    </div>

    <section className="panel list-panel">
      <div className="panel-head">
        <div className="toggle">
          <button className={tab === 'active' ? 'selected' : ''} onClick={() => setTab('active')}>Active ({active.length})</button>
          <button className={tab === 'past' ? 'selected' : ''} onClick={() => setTab('past')}>Past ({past.length})</button>
        </div>
      </div>

      {tab === 'active' && (active.length === 0
        ? <div className="empty-state"><Users size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>No active {terms.residents}</h3><p>Assign one to a vacant unit.</p></div>
        : <div className="table-scroll"><table>
            <thead><tr><th>Unit</th><th>{terms.Resident}</th><th>Phone</th><th>Outstanding</th><th>Payment</th><th>Account</th><th>Actions</th></tr></thead>
            <tbody>{active.map(r => {
              const outstanding = outstandingForUnit(r.unitNumber, invoices)
              const hasBills = invoices.some(i => i.unitNumber === r.unitNumber)
              return <tr key={r.id}>
                <td>{r.unitNumber}</td><td><strong>{r.name}</strong></td><td>{r.phone}</td>
                <td><strong>{fmt(outstanding)}</strong></td>
                <td>{hasBills ? <Status>{paymentStatusFor(r.unitNumber, invoices)}</Status> : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                <td><Status>{r.accountStatus}</Status></td>
                <td className="row-actions">
                  {r.accountStatus === 'Pending' && <button className="action-btn action-pay" title="Approve" onClick={() => { approveResident(r.unitNumber); notify(`${r.name} approved — account is now Active`) }}><ShieldCheck size={13} /></button>}
                  <button className="action-btn action-view" title="View details" onClick={() => onView(r.unitNumber)}><Eye size={13} /></button>
                  <button className="action-btn action-pay" title="Record payment" onClick={() => onRecordPayment(r.unitNumber)}><CircleDollarSign size={13} /></button>
                  <button className="action-btn action-edit" title="Edit" onClick={() => onEdit(r.unitNumber)}><Pencil size={13} /></button>
                  <button className="action-btn action-checkout" title="Move out / vacate unit" onClick={() => onCheckout(r.unitNumber)}><LogOut size={13} /></button>
                </td>
              </tr>
            })}</tbody>
          </table></div>)}

      {tab === 'past' && (past.length === 0
        ? <div className="empty-state"><LogOut size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>No past {terms.residents}</h3><p>Moved-out {terms.residents} keep their record here.</p></div>
        : <div className="table-scroll"><table>
            <thead><tr><th>{terms.Resident}</th><th>Last unit</th><th>Phone</th><th>Paid during stay</th><th>Moved out</th><th>Notice</th><th>Actions</th></tr></thead>
            <tbody>{past.map(r => {
              const unitVacant = units.find(u => u.unitNumber === r.unitNumber)?.occupancy === 'Vacant'
              return <tr key={r.id}>
                <td><strong>{r.name}</strong>{r.email ? <><br /><span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{r.email}</span></> : null}</td>
                <td>{r.unitNumber}</td><td>{r.phone}</td>
                <td><strong>{fmt(paidDuringStay(r))}</strong></td>
                <td>{r.movedOutAt ? new Date(r.movedOutAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                <td>{r.leftWithNotice === true
                  ? <span className="status status-active"><span className="status-dot" />Gave notice</span>
                  : r.leftWithNotice === false
                    ? <span className="status status-overdue"><span className="status-dot" />No notice</span>
                    : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                <td className="row-actions">
                  <button className="action-btn action-pay" title={`Re-assign ${r.name} to a property`} onClick={() => onReassign({ name: r.name, phone: r.phone, email: r.email })}><UserPlus size={13} /></button>
                  {unitVacant && <button className="action-btn action-view" title={`Reactivate on ${r.unitNumber}`} onClick={() => { reactivateResident(r.unitNumber); notify(`${r.name} reactivated on ${r.unitNumber}`) }}><UserCheck size={13} /></button>}
                  <button className="action-btn action-delete" title="Delete record" onClick={() => { if (confirm(`Delete ${r.name}'s past record? This cannot be undone.`)) deleteResident(r.id).then(() => notify(`${r.name}'s record deleted.`)) }}><X size={13} /></button>
                </td>
              </tr>
            })}</tbody>
          </table></div>)}
    </section>
  </>
}

function humanAction(a: string) {
  return a.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

function TeamActivityPanel({ logs }: { logs: AuditLog[] }) {
  const [who, setWho] = useState('all')
  const [qf, setQf] = useState('')
  const people = [...new Set(logs.map(l => l.performedBy).filter(Boolean))].sort()
  const rows = logs.filter(l =>
    (who === 'all' || l.performedBy === who) &&
    (!qf.trim() || `${l.action} ${l.performedBy} ${JSON.stringify(l.metadata)}`.toLowerCase().includes(qf.trim().toLowerCase())),
  )
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panel-head">
        <div><h2>Team activity</h2><p>Every change made in this workspace — last {logs.length} entries</p></div>
        <div className="list-actions">
          <select className="tier-select" value={who} onChange={e => setWho(e.target.value)}>
            <option value="all">Everyone</option>{people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="search" style={{ width: 170 }}><Search size={14} /><input value={qf} onChange={e => setQf(e.target.value)} placeholder="Filter…" /></div>
        </div>
      </div>
      {rows.length === 0
        ? <div className="settings-section"><p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No activity yet.</p></div>
        : <div className="table-scroll"><table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{rows.map(l => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.timestamp).toLocaleString()}</td>
                <td><strong>{l.performedBy}</strong></td>
                <td><span className="status status-active"><span className="status-dot" />{humanAction(l.action)}</span></td>
                <td><code className="audit-meta">{Object.entries(l.metadata).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') || '—'}</code></td>
              </tr>
            ))}</tbody>
          </table></div>}
    </div>
  )
}

function PaymentsView({ query, notify, onRecordPayment }: {
  query: string; notify: (m: string) => void; onRecordPayment: (u: string | null) => void
}) {
  const { payments: allPayments, invoices, currentSociety, deletePayment, isReadOnly } = useSociety()
  const terms = useTerms()
  // Payments only lists money actually received. Pending items live in Reminders.
  const payments = useMemo(() => allPayments.filter(p => p.status !== 'Pending'), [allPayments])
  const [tab, setTab] = useState<'all' | 'rent' | 'security' | 'other'>('all')
  const [method, setMethod] = useState('all')
  const [month, setMonth] = useState('all')

  const billType = (p: PaymentRecord): 'rent' | 'security' | 'other' => {
    const inv = invoices.find(i => i.id === p.invoiceId)
    if (inv?.period === 'Security deposit' || p.method === 'Security Deposit') return 'security'
    if (inv) return 'rent'
    return 'other'
  }
  const monthOf = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('en', { month: 'short', year: 'numeric' }) }

  const methods = useMemo(() => [...new Set(payments.map(p => p.method))].sort(), [payments])
  const months = useMemo(() => [...new Set(payments.map(p => monthOf(p.date)).filter(Boolean))]
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [payments])

  const q = query.trim().toLowerCase()
  const base = payments.filter(p =>
    (method === 'all' || p.method === method) &&
    (month === 'all' || monthOf(p.date) === month) &&
    (!q || `${p.receiptId} ${p.residentName} ${p.unitNumber} ${p.method}`.toLowerCase().includes(q)),
  )
  const counts = {
    all: base.length,
    rent: base.filter(p => billType(p) === 'rent').length,
    security: base.filter(p => billType(p) === 'security').length,
    other: base.filter(p => billType(p) === 'other').length,
  }
  const rows = base
    .filter(p => tab === 'all' || billType(p) === tab)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const shownTotal = rows.reduce((s, p) => s + p.amount, 0)

  const thisMonth = new Date().toLocaleString('en', { month: 'short', year: 'numeric' })
  const totalAll = payments.reduce((s, p) => s + p.amount, 0)
  const collectedThisMonth = payments.filter(p => monthOf(p.date) === thisMonth).reduce((s, p) => s + p.amount, 0)
  const rentTotal = payments.filter(p => billType(p) === 'rent').reduce((s, p) => s + p.amount, 0)
  const securityTotal = payments.filter(p => billType(p) === 'security').reduce((s, p) => s + p.amount, 0)

  const chargeLabel = (p: PaymentRecord) => { const t = billType(p); return t === 'security' ? 'Security' : t === 'rent' ? terms.Fee : (invoices.find(i => i.id === p.invoiceId)?.period ?? '—') }

  const exportRows = () => {
    downloadCsv(`${currentSociety.slug || 'payments'}-${tab}`, toCsv(
      ['Receipt', terms.Resident, 'Unit', 'For', 'Amount', 'Date', 'Method'],
      rows.map(p => [p.receiptId, p.residentName, p.unitNumber, chargeLabel(p), p.amount, p.date, p.method]),
    ))
    notify('Payments export downloaded.')
  }

  const handleDelete = (p: PaymentRecord) => {
    if (isReadOnly) return
    if (!confirm(`Delete payment ${p.receiptId} (${fmt(p.amount)})? The amount goes back onto the related bill.`)) return
    deletePayment(p.id).then(() => notify(`Payment ${p.receiptId} deleted.`))
  }

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label} ({counts[id]})</button>
  )

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{currentSociety.name}</p><h1>Payments received</h1><p className="muted">Money actually collected. Unconfirmed payments are followed up in Reminders.</p></div>
      <Button disabled={isReadOnly} onClick={() => onRecordPayment(null)}><Plus data-icon="inline-start" />Record payment</Button>
    </div>
    <div className="sub-kpis">
      <Kpi title="Total received" value={fmt(totalAll)} change={`${payments.length} payments`} icon={CircleDollarSign} color="teal" />
      <Kpi title={`${terms.Fee} collected`} value={fmt(rentTotal)} change={`${counts.rent} payments`} icon={Receipt} color="blue" />
      <Kpi title="Security collected" value={fmt(securityTotal)} change={`${counts.security} payments`} icon={ShieldCheck} color="teal" />
      <Kpi title="This month" value={fmt(collectedThisMonth)} change={thisMonth} icon={CheckCircle2} color="blue" />
    </div>

    <section className="panel list-panel">
      <div className="panel-head">
        <div className="toggle"><Tab id="all" label="All" /><Tab id="rent" label={terms.Fee} /><Tab id="security" label="Security" /><Tab id="other" label="Other" /></div>
        <div className="list-actions">
          <select className="tier-select" value={method} onChange={e => setMethod(e.target.value)}>
            <option value="all">All methods</option>{methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="tier-select" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="all">All months</option>{months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="filter-button" onClick={exportRows}><Download size={15} />Export</button>
        </div>
      </div>

      {rows.length === 0
        ? <div className="empty-state"><CircleDollarSign size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>Nothing here</h3><p>{payments.length === 0 ? 'Payments appear here once recorded.' : 'No payments match this filter.'}</p></div>
        : <>
          <div style={{ padding: '4px 20px 10px', fontSize: 11, color: 'var(--muted-foreground)' }}>{rows.length} payment{rows.length === 1 ? '' : 's'} · {fmt(shownTotal)}</div>
          <div className="table-scroll"><table>
            <thead><tr><th>Receipt</th><th>{terms.Resident}</th><th>Unit</th><th>For</th><th>Amount</th><th>Date</th><th>Method</th><th>Actions</th></tr></thead>
            <tbody>{rows.map(p => <tr key={p.id}>
              <td>{p.receiptId}</td><td><strong>{p.residentName}</strong></td><td>{p.unitNumber}</td><td>{chargeLabel(p)}</td>
              <td><strong>{fmt(p.amount)}</strong></td><td>{p.date}</td><td>{p.method}</td>
              <td className="row-actions"><button className="action-btn action-delete" title="Delete payment" onClick={() => handleDelete(p)}><X size={13} /></button></td>
            </tr>)}</tbody>
          </table></div>
        </>}
    </section>
  </>
}

function BillingView({ query, notify, onGenerate, onRecordPayment }: {
  query: string; notify: (m: string) => void; onGenerate: () => void; onRecordPayment: (u: string | null) => void
}) {
  const { invoices, overdueResidents, currentSociety, stats, canBatchGenerate, canSendAutomatedReminders, sendReminder, isReadOnly } = useSociety()
  const terms = useTerms()
  const [tab, setTab] = useState<'all' | 'unpaid' | 'overdue' | 'paid'>('all')
  const [period, setPeriod] = useState('all')

  const periods = useMemo(() => {
    const set = new Set(invoices.map(i => i.period))
    return [...set].sort((a, b) => {
      if (a === 'Security deposit') return -1
      if (b === 'Security deposit') return 1
      return new Date(b).getTime() - new Date(a).getTime()
    })
  }, [invoices])

  const q = query.trim().toLowerCase()
  const base = invoices.filter(i =>
    (period === 'all' || i.period === period) &&
    (!q || `${i.unitNumber} ${i.residentName} ${i.period}`.toLowerCase().includes(q)),
  )
  const counts = {
    all: base.length,
    unpaid: base.filter(i => i.outstanding > 0).length,
    overdue: base.filter(i => invoiceDisplayStatus(i) === 'Overdue').length,
    paid: base.filter(i => i.outstanding <= 0).length,
  }
  const rows = base.filter(i =>
    tab === 'all' ? true
    : tab === 'unpaid' ? i.outstanding > 0
    : tab === 'overdue' ? invoiceDisplayStatus(i) === 'Overdue'
    : i.outstanding <= 0,
  ).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())

  const shownOutstanding = rows.reduce((s, i) => s + i.outstanding, 0)
  const chargeLabel = (p: string) => p === 'Security deposit' ? 'Deposit' : terms.Fee

  const exportRows = () => {
    downloadCsv(`${currentSociety.slug || 'billing'}-${tab}`, toCsv(
      ['Period', 'Unit', terms.Resident, 'Charge', 'Amount', 'Paid', 'Outstanding', 'Due date', 'Status'],
      rows.map(i => [i.period, i.unitNumber, i.residentName, chargeLabel(i.period), i.amount, i.amount - i.outstanding, i.outstanding, i.dueDate, invoiceDisplayStatus(i)]),
    ))
    notify('Billing export downloaded.')
  }

  const Tab = ({ id, label }: { id: typeof tab; label: string }) => (
    <button className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label} ({counts[id]})</button>
  )

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{currentSociety.name}</p><h1>Billing &amp; charges</h1><p className="muted">Every invoice for your {terms.org} — filter by status or period.</p></div>
      <Button disabled={!canBatchGenerate || isReadOnly} onClick={onGenerate}><Plus data-icon="inline-start" />Generate charges{!canBatchGenerate && <span className="upgrade-hint">Upgrade to T2</span>}</Button>
    </div>
    <div className="sub-kpis">
      <Kpi title="Total billed" value={fmt(stats.totalInvoiced)} change={`${stats.totalInvoiceCount} invoices`} icon={Receipt} color="teal" />
      <Kpi title="Total collected" value={fmt(stats.totalCollection)} change={`${stats.collectionRate}% collection rate`} icon={CheckCircle2} color="blue" />
      <Kpi title="Outstanding" value={fmt(stats.totalOutstanding)} change={stats.overdueCount > 0 ? `${stats.overdueCount} accounts overdue` : 'Nothing overdue'} icon={AlertCircle} color="amber" down />
    </div>

    <section className="panel list-panel">
      <div className="panel-head">
        <div className="toggle"><Tab id="all" label="All" /><Tab id="unpaid" label="Unpaid" /><Tab id="overdue" label="Overdue" /><Tab id="paid" label="Paid" /></div>
        <div className="list-actions">
          <select className="tier-select" value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="all">All periods</option>
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="filter-button" onClick={exportRows}><Download size={15} />Export</button>
        </div>
      </div>

      {rows.length === 0
        ? <div className="empty-state"><Receipt size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>Nothing here</h3><p>{invoices.length === 0 ? 'Generate charges to create invoices.' : 'No invoices match this filter.'}</p></div>
        : <>
          <div style={{ padding: '4px 20px 10px', fontSize: 11, color: 'var(--muted-foreground)' }}>{rows.length} invoice{rows.length === 1 ? '' : 's'}{shownOutstanding > 0 ? ` · ${fmt(shownOutstanding)} outstanding` : ''}</div>
          <div className="table-scroll"><table>
            <thead><tr><th>Period</th><th>Unit</th><th>{terms.Resident}</th><th>Charge</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{rows.map(inv => {
              const status = invoiceDisplayStatus(inv)
              const unpaid = inv.outstanding > 0
              const reminder = overdueResidents.find(o => o.unitNumber === inv.unitNumber)
              return <tr key={inv.id}>
                <td><strong>{inv.period}</strong></td><td>{inv.unitNumber}</td><td><strong>{inv.residentName || '—'}</strong></td><td>{chargeLabel(inv.period)}</td>
                <td><strong>{fmt(inv.amount)}</strong></td><td>{fmt(inv.amount - inv.outstanding)}</td><td>{fmt(inv.outstanding)}</td><td>{inv.dueDate}</td>
                <td><Status>{status}</Status></td>
                <td className="row-actions">
                  {unpaid ? <>
                    <button className="action-btn action-pay" title="Record payment" onClick={() => onRecordPayment(inv.unitNumber)}><CircleDollarSign size={13} /></button>
                    {reminder && canSendAutomatedReminders && <button className="action-btn action-view" title="Send reminder" onClick={() => { void sendReminder(reminder.id); notify(`Reminder sent to ${reminder.name}`) }}><Send size={13} /></button>}
                  </> : <span className="status status-paid"><span className="status-dot" />✓ Settled</span>}
                </td>
              </tr>
            })}</tbody>
          </table></div>
        </>}
    </section>
  </>
}

function SectionView({ view, query, filteredResidentRows, paymentRows, open, notify, onNavigate, onViewResident, onViewProperty, onRecordPayment, onEditUnit, onEditResident, onCheckout, onReassign, onConvertLead }: { view: View; query: string; filteredResidentRows: string[][]; paymentRows: string[][]; open: (v: Exclude<Modal, null>) => void; notify: (msg: string) => void; onNavigate: (v: View) => void; onViewResident: (unitNumber: string) => void; onViewProperty: (unitId: string) => void; onRecordPayment: (unitNumber: string | null) => void; onEditUnit: (unitId: string) => void; onEditResident: (unitNumber: string) => void; onCheckout: (unitNumber: string) => void; onReassign: (r: { name: string; phone: string; email?: string }) => void; onConvertLead: (lead: Lead) => void }) {
  const { units, residents, payments: ctxPayments, overdueResidents, invoices: ctxInvoices, auditLogs, sendReminder, confirmPayment, deletePayment, canSendAutomatedReminders, canAccessAdvancedReports, canAccessAuditLogs, canManageTeam, canAccessCrm, canAccessSite, currentTier, currentSociety, refreshData, deleteUnit, stats, approveResident, requestPlanChange, updateSociety, isReadOnly } = useSociety()
  const settingsSub = useSubscription()
  const { user: settingsUser } = useAuth()
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<'success' | 'error' | null>(null)
  const [seedDetail, setSeedDetail] = useState('')
  const requestUpgrade = (target: 'TIER_2' | 'TIER_3') => {
    void requestPlanChange('tier', `Upgrade to ${target}`)
    notify('Upgrade request sent to your provider. They will confirm and switch your plan.')
  }
  const slug = currentSociety.slug || currentSociety.name.toLowerCase().replace(/\W+/g, '-')
  const exportLedger = () => {
    const byPeriod = new Map<string, { billed: number; collected: number; outstanding: number }>()
    for (const inv of ctxInvoices) {
      const e = byPeriod.get(inv.period) ?? { billed: 0, collected: 0, outstanding: 0 }
      e.billed += inv.amount; e.outstanding += inv.outstanding; e.collected += inv.amount - inv.outstanding
      byPeriod.set(inv.period, e)
    }
    const rows = [...byPeriod.entries()].map(([p, e]) => [p, e.billed, e.collected, e.outstanding])
    downloadCsv(`${slug}-collection-ledger`, toCsv(['Period', 'Billed (PKR)', 'Collected (PKR)', 'Outstanding (PKR)'], rows))
    notify('Collection ledger exported.')
  }
  const exportDefaulters = () => {
    const rows = overdueResidents
      .slice().sort((a, b) => b.daysOverdue - a.daysOverdue)
      .map(r => {
        const bucket = r.daysOverdue > 90 ? '90+ days' : r.daysOverdue > 60 ? '61-90 days' : r.daysOverdue > 30 ? '31-60 days' : r.daysOverdue > 0 ? '1-30 days' : 'Not yet due'
        return [r.unitNumber, r.name, r.phone, r.balance, r.daysOverdue, bucket, r.lastReminderDate || '—']
      })
    downloadCsv(`${slug}-defaulters-aging`, toCsv(['Unit', 'Resident', 'Phone', 'Outstanding (PKR)', 'Days overdue', 'Aging bucket', 'Last reminder'], rows))
    notify('Defaulters aging report exported.')
  }
  const exportUnitRevenue = () => {
    const byUnit = new Map<string, number>()
    for (const p of ctxPayments) byUnit.set(p.unitNumber, (byUnit.get(p.unitNumber) ?? 0) + p.amount)
    const rows = units.map(u => [u.unitNumber, u.block, u.occupancy, u.monthlyCharge, byUnit.get(u.unitNumber) ?? 0])
    downloadCsv(`${slug}-unit-revenue`, toCsv(['Unit', 'Block', 'Occupancy', 'Monthly charge (PKR)', 'Collected to date (PKR)'], rows))
    notify('Unit-wise revenue exported.')
  }
  const exportReconciliation = () => {
    const rows = ctxPayments.map(p => [p.receiptId, p.date, p.unitNumber, p.residentName, p.amount, p.method, ctxInvoices.find(i => i.id === p.invoiceId)?.period ?? '—'])
    downloadCsv(`${slug}-payment-reconciliation`, toCsv(['Receipt', 'Date', 'Unit', 'Resident', 'Amount (PKR)', 'Method', 'Bill period'], rows))
    notify('Payment reconciliation exported.')
  }
  const handleSeed = async () => {
    setSeeding(true); setSeedMsg(null); setSeedDetail('')
    try {
      const r = await seedCurrentSociety(currentSociety.id)
      await refreshData(true)
      setSeedMsg('success')
      setSeedDetail(`${r.units} units, ${r.residents} residents, ${r.invoices} invoices seeded.`)
    } catch (err: unknown) {
      setSeedMsg('error')
      const msg = err instanceof Error ? err.message : String(err)
      setSeedDetail(msg.includes('supabase') || msg.includes('SUPABASE')
        ? 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        : msg || 'An unexpected error occurred during seeding.')
    } finally {
      setSeeding(false)
    }
  }
  const config: Record<View, { title: string; subtitle: string; action?: Exclude<Modal, null> }> = { Properties: { title: 'Properties', subtitle: 'Manage units, blocks, and occupancy across your society.', action: 'property' }, Residents: { title: 'Residents', subtitle: 'Keep resident contacts and account status up to date.', action: 'resident' }, Billing: { title: 'Billing & charges', subtitle: 'Create monthly invoices and monitor what is due.', action: 'charges' }, Payments: { title: 'Payments', subtitle: 'Review incoming payments and receipts.', action: 'payment' }, Reminders: { title: 'Payment reminders', subtitle: 'Follow up with residents who have outstanding balances.', action: 'reminder' }, Reports: { title: 'Reports', subtitle: 'Understand collections and society performance.', action: undefined }, Leads: { title: 'Leads', subtitle: 'Track prospective residents from your website inquiry form to move-in.', action: undefined }, Website: { title: 'Website', subtitle: 'Build the public page prospects see — and where they submit inquiries.', action: undefined }, Team: { title: 'Team', subtitle: 'Add people and control who can view or edit this workspace.', action: undefined }, Settings: { title: 'Settings', subtitle: 'Configure your society and administrator preferences.', action: undefined }, Dashboard: { title: 'Dashboard', subtitle: '', action: undefined } }
  const c = config[view]
  const showTable = view === 'Properties' && units.length > 0
  const q = query.trim().toLowerCase()
  const match = (...parts: (string | number | undefined)[]) => !q || parts.join(' ').toLowerCase().includes(q)
  const filteredUnits = units.filter(u => match(u.unitNumber, u.type, u.block, u.occupancy, u.ownerName))

  if (view === 'Settings') {
    return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>{c.title}</h1><p className="muted">{c.subtitle}</p></div></div>
      <SocietyProfileForm society={currentSociety} unitCount={units.length} disabled={isReadOnly} onSave={updateSociety} notify={notify} />

      {canManageTeam && <div className="panel" style={{ marginTop: 14 }}><div className="panel-head"><div><h2>Team</h2><p>Manage users and access</p></div><Button variant="outline" size="sm" onClick={() => onNavigate('Team')}>Open Team →</Button></div></div>}

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Notification Preferences</h2><p>Control how residents receive notifications</p></div></div>
        <div className="settings-section">
          <div className="settings-row"><span className="settings-label">Automated WhatsApp Reminders {!canSendAutomatedReminders && <span className="upgrade-badge">T2+</span>}</span>{canSendAutomatedReminders ? <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider" /></label> : <span className="locked-hint"><Lock size={11} />Requires T2 Pro</span>}</div>
          <div className="settings-row"><span className="settings-label">Email Payment Receipts</span><label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider" /></label></div>
        </div>
      </div>

      <div className="panel pricing-panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Plan & Pricing Comparison</h2><p>See what's included in each tier</p></div><span className="current-plan-badge">Current: {currentTier === 'TIER_1' ? 'T1 Basic' : currentTier === 'TIER_2' ? 'T2 Pro' : 'T3 Enterprise'}</span></div>
        <div className="pricing-grid">
          <div className={`pricing-col ${currentTier === 'TIER_1' ? 'active' : ''}`}>
            <div className="pricing-head"><h3>T1 Basic</h3><strong>PKR 1,500<small>/mo</small></strong></div>
            <ul className="pricing-features">
              <li className="included"><CheckCircle2 size={14} />Single society management</li>
              <li className="included"><CheckCircle2 size={14} />Unit & resident directory</li>
              <li className="included"><CheckCircle2 size={14} />Invoice tracking</li>
              <li className="included"><CheckCircle2 size={14} />Payment recording</li>
              <li className="excluded"><Lock size={14} />Batch invoice generation</li>
              <li className="excluded"><Lock size={14} />Automated WhatsApp reminders</li>
              <li className="excluded"><Lock size={14} />Advanced reports</li>
              <li className="excluded"><Lock size={14} />Multi-society management</li>
              <li className="excluded"><Lock size={14} />Audit logs</li>
              <li className="excluded"><Lock size={14} />Public website (CMS)</li>
              <li className="excluded"><Lock size={14} />Leads / CRM</li>
            </ul>
            {currentTier !== 'TIER_1' ? <div className="pricing-current">Current Plan</div> : <Button size="sm" className="pricing-upgrade-btn" onClick={() => requestUpgrade('TIER_2')}>Request T2 Pro</Button>}
          </div>
          <div className={`pricing-col ${currentTier === 'TIER_2' ? 'active' : ''}`}>
            <div className="pricing-head"><h3>T2 Pro</h3><strong>PKR 3,000<small>/mo</small></strong></div>
            <ul className="pricing-features">
              <li className="included"><CheckCircle2 size={14} />Single society management</li>
              <li className="included"><CheckCircle2 size={14} />Unit & resident directory</li>
              <li className="included"><CheckCircle2 size={14} />Invoice tracking</li>
              <li className="included"><CheckCircle2 size={14} />Payment recording</li>
              <li className="included"><CheckCircle2 size={14} />Batch invoice generation</li>
              <li className="included"><CheckCircle2 size={14} />Automated WhatsApp reminders</li>
              <li className="included"><CheckCircle2 size={14} />Advanced reports</li>
              <li className="excluded"><Lock size={14} />Multi-society management</li>
              <li className="excluded"><Lock size={14} />Audit logs</li>
              <li className="excluded"><Lock size={14} />Public website (CMS)</li>
              <li className="excluded"><Lock size={14} />Leads / CRM</li>
            </ul>
            {currentTier === 'TIER_2' ? <Button size="sm" className="pricing-upgrade-btn" onClick={() => requestUpgrade('TIER_3')}>Request T3 Enterprise</Button> : currentTier === 'TIER_3' ? <div className="pricing-current">Current Plan</div> : <Button size="sm" variant="outline" className="pricing-upgrade-btn" onClick={() => requestUpgrade('TIER_3')}>Request T3 Enterprise</Button>}
          </div>
          <div className={`pricing-col ${currentTier === 'TIER_3' ? 'active' : ''}`}>
            <div className="pricing-head"><h3>T3 Enterprise</h3><strong>PKR 5,000<small>/mo</small></strong></div>
            <ul className="pricing-features">
              <li className="included"><CheckCircle2 size={14} />Single society management</li>
              <li className="included"><CheckCircle2 size={14} />Unit & resident directory</li>
              <li className="included"><CheckCircle2 size={14} />Invoice tracking</li>
              <li className="included"><CheckCircle2 size={14} />Payment recording</li>
              <li className="included"><CheckCircle2 size={14} />Batch invoice generation</li>
              <li className="included"><CheckCircle2 size={14} />Automated WhatsApp reminders</li>
              <li className="included"><CheckCircle2 size={14} />Advanced reports</li>
              <li className="included"><CheckCircle2 size={14} />Multi-society management</li>
              <li className="included"><CheckCircle2 size={14} />Audit logs</li>
              <li className="included"><CheckCircle2 size={14} />Public website (CMS)</li>
              <li className="included"><CheckCircle2 size={14} />Leads / CRM</li>
            </ul>
            {currentTier === 'TIER_3' ? <div className="pricing-current">Current Plan</div> : <Button size="sm" variant="outline" className="pricing-upgrade-btn" onClick={() => requestUpgrade('TIER_3')}>Request T3 Enterprise</Button>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Developer Tools</h2><p>Manage seed data for testing</p></div></div>
        <div className="settings-section">
          <div className="settings-row"><span className="settings-label">Reset &amp; Seed Demo Data</span><div className="seed-actions"><Button type="button" variant="outline" size="sm" className="seed-btn" onClick={handleSeed} disabled={seeding}>{seeding ? <><span className="seed-spinner" />Seeding…</> : 'Seed Database'}</Button>{seedMsg === 'success' && <span className="seed-msg seed-success">✓ {seedDetail}</span>}{seedMsg === 'error' && <span className="seed-msg seed-error">✗ {seedDetail}</span>}</div></div>
        </div>
      </div>

      {!canManageTeam && !canAccessAuditLogs && <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Team &amp; activity log</h2><p>See every change your team makes</p></div></div>
        <div className="upgrade-banner"><ShieldCheck size={20} /><p>Team members and the activity log are available on T2 Pro and above.</p></div>
      </div>}
    </>
  }

  if (view === 'Reports') {
    return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p>
      <h1>{c.title}</h1>
      <p className="muted">{c.subtitle}</p>
    </div></div>
      <div className="kpi-grid">
        <Kpi title="Total Invoiced" value={fmt(stats.totalInvoiced)} change={`${stats.totalInvoiceCount} invoices issued`} icon={Receipt} color="teal" />
        <Kpi title="Total Collected" value={fmt(stats.totalCollection)} change={`${stats.collectionRate}% collection rate`} icon={CircleDollarSign} color="blue" />
        <Kpi title="Total Outstanding" value={fmt(stats.totalOutstanding)} change={stats.overdueCount > 0 ? `${stats.overdueCount} accounts overdue` : 'Nothing overdue'} icon={WalletCards} color="amber" down />
        <Kpi title="Collection Rate" value={`${stats.collectionRate}%`} change={`${stats.paidInvoiceCount}/${stats.totalInvoiceCount} bills fully paid`} icon={TrendingUp} color="teal" />
      </div>
      <div className="kpi-grid">
        <Kpi title="Occupied units" value={String(stats.occupiedUnits)} change={stats.unitCount > 0 ? `${Math.round((stats.occupiedUnits / Math.max(1, stats.unitCount)) * 100)}% occupancy` : '—'} icon={Building2} color="teal" />
        <Kpi title="Vacant units" value={String(stats.vacantUnits)} change={stats.vacantUnits > 0 ? 'Available to assign' : 'None vacant'} icon={Home} color="amber" down={stats.vacantUnits > 0} />
        <Kpi title="Active residents" value={String(stats.activeResidents)} change={`${residents.filter(r => r.accountStatus === 'Pending').length} pending activation`} icon={Users} color="blue" />
        <Kpi title="Overdue accounts" value={String(stats.overdueCount)} change={stats.overdueCount > 0 ? 'Needs follow-up' : 'All caught up'} icon={AlertCircle} color={stats.overdueCount > 0 ? 'red' : 'teal'} down={stats.overdueCount > 0} />
      </div>
      <div className="report-cards-grid">
        <div className="report-card"><FileText size={18} color="var(--primary)" /><h3>Monthly Collection Ledger <span className="tier-badge-inline">T1</span></h3><p>Track month-by-month income and outstanding amounts across all units.</p><div className="report-card-actions"><Button variant="outline" size="sm" onClick={exportLedger}><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm" onClick={() => window.print()}><Download data-icon="inline-start" />Print / PDF</Button></div></div>
        <div className="report-card"><AlertCircle size={18} color="var(--danger)" /><h3>Defaulters Aging Report <span className="tier-badge-inline">T1</span></h3><p>Identify overdue accounts grouped by how long they have been outstanding.</p><div className="report-card-actions"><Button variant="outline" size="sm" onClick={exportDefaulters}><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm" onClick={() => window.print()}><Download data-icon="inline-start" />Print / PDF</Button></div></div>
        {!canAccessAdvancedReports && <div className="upgrade-banner"><ShieldCheck size={20} /><p>Upgrade to {currentTier === 'TIER_1' ? 'T2 Pro (PKR 3,000/mo)' : 'unlock this feature'} for advanced reports.</p></div>}
        {canAccessAdvancedReports && <div className="report-card"><Building2 size={18} color="var(--primary)" /><h3>Unit-Wise Revenue <span className="tier-badge-inline">T2</span></h3><p>Revenue breakdown per unit block for targeted financial analysis.</p><div className="report-card-actions"><Button variant="outline" size="sm" onClick={exportUnitRevenue}><Download data-icon="inline-start" />Export CSV</Button></div></div>}
        {canAccessAdvancedReports && <div className="report-card"><CheckCircle2 size={18} color="var(--primary)" /><h3>Payment Reconciliation <span className="tier-badge-inline">T2</span></h3><p>Verify recorded payments against bank statements and detect discrepancies.</p><div className="report-card-actions"><Button variant="outline" size="sm" onClick={exportReconciliation}><Download data-icon="inline-start" />Export CSV</Button></div></div>}
        {!canAccessAuditLogs && <div className="report-card locked-card"><Lock size={18} color="var(--muted-foreground)" /><h3>Audit Logs <span className="tier-badge-inline tier-t3">T3</span></h3><p>Security audit trail for all financial actions and access events.</p><div className="locked-card-overlay"><Lock size={16} />T3 Enterprise (PKR 5,000/mo)</div></div>}
        {canAccessAuditLogs && <div className="report-card"><ShieldCheck size={18} color="var(--primary)" /><h3>Audit Logs <span className="tier-badge-inline tier-t3">T3</span></h3><p>Security audit trail for all financial actions and access events.</p><div className="report-card-actions"><Button variant="outline" size="sm" onClick={() => { downloadCsv(`${slug}-audit-log`, toCsv(['Timestamp', 'Action', 'Performed by', 'Details'], auditLogs.map(l => [new Date(l.timestamp).toLocaleString(), l.action, l.performedBy, JSON.stringify(l.metadata)]))); notify('Audit log exported.') }}><Download data-icon="inline-start" />Export CSV</Button></div></div>}
      </div>
    </>
  }

  if (view === 'Reminders') {
    return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>{c.title}</h1><p className="muted">{c.subtitle}</p></div><Button onClick={() => open('reminder')}><Plus data-icon="inline-start" />Send reminder</Button></div>
      <div className="tier-comparison-banner">
        <div className={`tier-comp-col ${currentTier === 'TIER_1' ? 'active' : ''}`}><span className="tier-comp-label">T1 Basic</span><p>Manual SMS</p><span className="tier-comp-price">PKR 1,500/mo</span>{currentTier === 'TIER_1' && <span className="tier-active-check">✓ Active</span>}</div>
        <div className={`tier-comp-col ${currentTier === 'TIER_2' ? 'active' : ''}`}><span className="tier-comp-label">T2 Pro</span><p>WhatsApp Automation</p><span className="tier-comp-price">PKR 3,000/mo</span>{currentTier === 'TIER_2' && <span className="tier-active-check">✓ Active</span>}</div>
        <div className={`tier-comp-col ${currentTier === 'TIER_3' ? 'active' : ''}`}><span className="tier-comp-label">T3 Enterprise</span><p>WhatsApp Automation</p><span className="tier-comp-price">PKR 5,000/mo</span>{currentTier === 'TIER_3' && <span className="tier-active-check">✓ Active</span>}</div>
      </div>
      {(() => {
        const pending = ctxPayments.filter(p => p.status === 'Pending')
        if (pending.length === 0) return null
        return <section className="panel list-panel" style={{ marginBottom: 14 }}>
          <div className="panel-head"><div><h2>Pending payments</h2><p>{pending.length} payment{pending.length !== 1 ? 's' : ''} awaiting clearance — {fmt(pending.reduce((s, p) => s + p.amount, 0))}. Confirm once the money is in.</p></div></div>
          <div className="table-scroll"><table><thead><tr><th>Receipt</th><th>Resident</th><th>Unit</th><th>Amount</th><th>Method</th><th>Logged</th><th>Action</th></tr></thead><tbody>
            {pending.map(p => <tr key={p.id}>
              <td>{p.receiptId}</td><td><strong>{p.residentName}</strong></td><td>{p.unitNumber}</td><td><strong>{fmt(p.amount)}</strong></td><td>{p.method}</td><td>{p.date}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="whatsapp-btn" style={{ background: 'var(--primary)' }} onClick={() => { void confirmPayment(p.id); notify(`Payment ${p.receiptId} confirmed.`) }}><CheckCircle2 size={12} />Confirm</button>
                <button className="action-btn action-delete" title="Discard" onClick={() => { if (confirm(`Discard pending payment ${p.receiptId}?`)) deletePayment(p.id).then(() => notify('Pending payment discarded.')) }}><X size={13} /></button>
              </td>
            </tr>)}
          </tbody></table></div>
        </section>
      })()}
      <section className="panel list-panel">
        <div className="panel-head"><div><h2>Overdue residents</h2><p>{overdueResidents.length} account{overdueResidents.length !== 1 ? 's' : ''} with outstanding balances in {currentSociety.name}</p></div></div>
        {overdueResidents.length === 0 ? (
          <div className="empty-state"><AlertCircle size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>No reminders</h3><p>All payments are up to date.</p></div>
        ) : (
          <div className="table-scroll"><table><thead><tr><th>Resident Name</th><th>Unit #</th><th>Outstanding Balance</th><th>Due date / Status</th><th>Last Reminder</th><th>Action</th></tr></thead><tbody>
            {overdueResidents.map(r => <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.unitNumber}</td><td><strong>{fmt(r.balance)}</strong></td><td>{r.daysOverdue > 0 ? <span className="status status-overdue"><span className="status-dot" />Overdue · {r.daysOverdue} days</span> : <span className="status status-pending"><span className="status-dot" />Due</span>}{r.earliestDueDate ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted-foreground)' }}>due {r.earliestDueDate}</span> : null}</td><td>{r.lastReminderDate || '—'}</td><td style={{ whiteSpace: 'nowrap' }}>{canSendAutomatedReminders && <button className="whatsapp-btn" onClick={() => { openWhatsAppReminder(r.name, r.phone, r.unitNumber, r.balance, currentSociety.name); void sendReminder(r.id); notify(`Reminder opened for ${r.name}`) }}><Send size={12} />Send WhatsApp Reminder</button>}<button className="action-btn action-pay" title="Record payment" onClick={() => onRecordPayment(r.unitNumber)}><CircleDollarSign size={13} /></button><button className="action-btn action-view" title="View bill" onClick={() => onNavigate('Billing')}><FileText size={13} /></button>{!canSendAutomatedReminders && <span className="locked-hint"><Lock size={11} />Upgrade to T2</span>}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </>
  }

  if (view === 'Leads') {
    return <>
      <div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>Leads</h1><p className="muted">{c.subtitle}</p></div></div>
      {canAccessCrm
        ? <LeadsView query={query} notify={notify} onConvert={onConvertLead} onNavigate={onNavigate} />
        : <div className="panel"><div className="panel-head"><div><h2>Leads &amp; CRM</h2></div></div><div className="upgrade-banner"><Sparkles size={20} /><p>Capture and manage prospective residents on <strong>T3 Enterprise</strong>. Your public website&apos;s inquiry form feeds straight into this pipeline. <button className="linkish" onClick={() => onNavigate('Settings')}>See plans</button></p></div></div>}
    </>
  }
  if (view === 'Website') {
    return <>
      <div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>Website</h1><p className="muted">{c.subtitle}</p></div></div>
      {canAccessSite
        ? <WebsiteView notify={notify} onNavigate={onNavigate} />
        : <div className="panel"><div className="panel-head"><div><h2>Public website</h2></div></div><div className="upgrade-banner"><Globe size={20} /><p>Give your {currentSociety.kind === 'plaza' ? 'plaza' : 'society'} a branded public website with a lead-capture form on <strong>T3 Enterprise</strong>. <button className="linkish" onClick={() => onNavigate('Settings')}>See plans</button></p></div></div>}
    </>
  }
  if (view === 'Team') {
    return <>
      <div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>Team</h1><p className="muted">{c.subtitle}</p></div></div>
      {canManageTeam
        ? <>
            <TeamPanel societyId={currentSociety.id} seatsUsed={settingsSub.seatsUsed} seatsTotal={settingsSub.seatsTotal} myUserId={settingsUser?.id} notify={notify} />
            <TeamActivityPanel logs={auditLogs} />
          </>
        : <div className="panel"><div className="panel-head"><div><h2>Team &amp; access</h2></div></div><div className="upgrade-banner"><ShieldCheck size={20} /><p>Adding users is available on T2 Pro and T3 Enterprise.</p></div></div>}
    </>
  }
  if (view === 'Residents') {
    return <ResidentsView query={query} notify={notify} onAdd={() => open('resident')} onView={onViewResident} onEdit={onEditResident} onRecordPayment={onRecordPayment} onCheckout={onCheckout} onReassign={onReassign} />
  }
  if (view === 'Billing') {
    return <BillingView query={query} notify={notify} onGenerate={() => open('charges')} onRecordPayment={onRecordPayment} />
  }
  if (view === 'Payments') {
    return <PaymentsView query={query} notify={notify} onRecordPayment={onRecordPayment} />
  }

  const handleDeleteUnit = (unitId: string, label: string) => {
    if (!confirm(`Delete ${label}? This action cannot be undone.`)) return
    deleteUnit(unitId).then(() => notify(`Deleted ${label} successfully.`))
  }

  return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>{c.title}</h1><p className="muted">{c.subtitle}</p></div>{c.action && <Button onClick={() => open(c.action!)}><Plus data-icon="inline-start" />{c.action === 'charges' ? 'Generate charges' : c.action === 'payment' ? 'Record payment' : c.action === 'reminder' ? 'Send reminder' : c.action === 'property' ? 'Add property' : 'Add resident'}</Button>}</div><div className="sub-kpis">
        {view === 'Properties' && <><Kpi title="Total properties" value={String(units.length)} change={`${stats.occupiedUnits} occupied · ${stats.vacantUnits} vacant`} icon={Building2} color="teal" /><Kpi title="Occupied" value={String(stats.occupiedUnits)} change={units.length > 0 ? `${Math.round((stats.occupiedUnits / Math.max(1, units.length)) * 100)}% occupancy` : '—'} icon={Home} color="blue" /><Kpi title="Vacant" value={String(stats.vacantUnits)} change={stats.vacantUnits > 0 ? 'Available to assign' : 'None vacant'} icon={AlertCircle} color={stats.vacantUnits > 0 ? 'amber' : 'teal'} down={stats.vacantUnits > 0} /></>}
      </div><section className="panel list-panel"><div className="panel-head"><div><h2>{`${c.title} overview`}</h2><p>{query ? `Showing results for \u201c${query}\u201d` : 'Updated a few moments ago'}</p></div><div className="list-actions"><button className="filter-button"><SlidersHorizontal size={15} />Filters</button><button className="filter-button"><Download size={15} />Export</button></div></div>
      {view === 'Properties' && units.length === 0 && <div className="empty-state"><Building2 size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>No properties yet</h3><p>Add your first property to get started.</p></div>}
      {showTable && <div className="table-scroll"><table><thead><tr>
        {view === 'Properties' && <><th>Unit</th><th>Type</th><th>Location / Block</th><th>Occupancy</th><th>Resident</th><th>Monthly Charge</th><th>Actions</th></>}
      </tr></thead><tbody>
        {view === 'Properties' && filteredUnits.map(u => {
          const occupied = u.occupancy === 'Occupied'
          const activeResident = residents.find(r => r.unitNumber === u.unitNumber && r.accountStatus !== 'Inactive')
          return <tr key={u.id}>
            <td><strong>{u.unitNumber}</strong></td><td>{u.type}</td><td>{`${currentSociety.name.split(' ')[0]} Block ${u.block}`}</td><td><Status>{u.occupancy}</Status></td>
            <td>{occupied ? <strong>{activeResident?.name ?? u.ownerName ?? '—'}</strong> : <span style={{ color: 'var(--muted-foreground)' }}>None</span>}</td>
            <td><strong>{fmt(u.monthlyCharge)}</strong>/mo</td>
            <td className="row-actions">
              <button className="action-btn action-view" title="View property" onClick={() => onViewProperty(u.id)}><Eye size={13} /></button>
              {occupied && <button className="action-btn action-view" title="View resident" onClick={() => onViewResident(u.unitNumber)}><Users size={13} /></button>}
              <button className="action-btn action-edit" title="Edit property" onClick={() => onEditUnit(u.id)}><Pencil size={13} /></button>
              {occupied
                ? <button className="action-btn action-pay" title="View billing" onClick={() => onNavigate('Billing')}><Receipt size={13} /></button>
                : <button className="action-btn action-pay" title="Add / assign resident" onClick={() => open('resident')}><UserPlus size={13} /></button>}
              {!occupied && <button className="action-btn action-delete" title="Delete" onClick={() => handleDeleteUnit(u.id, u.unitNumber)}><X size={13} /></button>}
            </td>
          </tr>
        })}
      </tbody></table></div>}
    </section></>
}
