'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Bell, Building2, CalendarDays, ChevronDown, CircleDollarSign,
  CreditCard, FileText, HelpCircle, Home, LayoutDashboard, MoreHorizontal, Plus,
  Receipt, Search, Settings, ShieldCheck, Users, WalletCards, X, Send, Download, CheckCircle2,
  AlertCircle, Clock3, TrendingUp, Landmark, SlidersHorizontal, Lock, PanelLeftClose, PanelLeft, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety, TIER_INFO, type SubscriptionTier } from '@/lib/society-context'
import RecordPaymentModal from '@/components/record-payment-modal'
import GenerateChargesModal from '@/components/generate-charges-modal'
import EditProfileModal from '@/components/edit-profile-modal'
import SocietySwitcherModal from '@/components/society-switcher-modal'
import NotificationsModal from '@/components/notifications-modal'
import { seedDatabase } from '@/lib/seed'

type View = 'Dashboard' | 'Properties' | 'Residents' | 'Billing' | 'Payments' | 'Reminders' | 'Reports' | 'Settings'
type Modal = 'charges' | 'payment' | 'reminder' | 'property' | 'resident' | 'editProperty' | 'editResident' | 'checkout' | null

const nav: { label: View; icon: typeof Home }[] = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Properties', icon: Building2 },
  { label: 'Residents', icon: Users }, { label: 'Billing', icon: Receipt },
  { label: 'Payments', icon: CreditCard }, { label: 'Reminders', icon: Bell },
  { label: 'Reports', icon: FileText }, { label: 'Settings', icon: Settings },
]
const fmt = (value: number) => `PKR ${value.toLocaleString('en-PK')}`

function Status({ children }: { children: string }) {
  const tone = children === 'Paid' || children === 'Active' ? 'status-paid' : children === 'Overdue' ? 'status-overdue' : children === 'Occupied' ? 'status-occupied' : children === 'Vacant' ? 'status-vacant' : children === 'Pending' ? 'status-pending' : 'status-partial'
  return <span className={`status ${tone}`}><span className="status-dot" />{children}</span>
}

function PropertyModal({ close, onSuccess }: { close: () => void; onSuccess: (msg: string) => void }) {
  const { addUnit, currentSociety } = useSociety()
  const [unitNumber, setUnitNumber] = useState('')
  const [block, setBlock] = useState('')
  const [monthlyCharge, setMonthlyCharge] = useState('12500')

  const handleSubmit = () => {
    if (!unitNumber.trim() || !block.trim()) return
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
    <p className="modal-hint">New properties default to <strong>Vacant</strong> status. Use "Add Resident" to assign an owner.</p>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={!unitNumber.trim() || !block.trim()}>
        <CheckCircle2 data-icon="inline-start" />Add property</Button>
    </div>
  </div></div>
}

function AddResidentModal({ close, onSuccess }: { close: () => void; onSuccess: (msg: string) => void }) {
  const { units, assignResident, currentSociety } = useSociety()
  const vacantUnits = units.filter(u => u.occupancy === 'Vacant')
  const [selectedUnit, setSelectedUnit] = useState(vacantUnits[0]?.unitNumber ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [securityDeposit, setSecurityDeposit] = useState(String(units.find(u => u.unitNumber === vacantUnits[0]?.unitNumber)?.monthlyCharge ?? 12500))
  const [advanceRent, setAdvanceRent] = useState('0')
  const selectedUnitObj = units.find(u => u.unitNumber === selectedUnit)

  const handleUnitChange = (unitNum: string) => {
    setSelectedUnit(unitNum)
    const u = units.find(u2 => u2.unitNumber === unitNum)
    if (u) setSecurityDeposit(String(u.monthlyCharge))
  }

  const handleSubmit = () => {
    if (!selectedUnit || !name.trim()) return
    assignResident(selectedUnit, name.trim(), phone.trim(), {
      email: email.trim() || undefined,
      securityDeposit: Number(securityDeposit) || 0,
      advanceRent: Number(advanceRent) || 0,
    })
    onSuccess(`${name.trim()} assigned to ${selectedUnit} in ${currentSociety.name}`)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">Assign to vacant unit</p><h2>Add a resident</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    {vacantUnits.length === 0 ? <div className="empty-state" style={{ padding: '32px 20px' }}><AlertCircle size={28} strokeWidth={1.5} color="var(--muted-foreground)" /><p style={{ margin: '8px 0 0', fontSize: 12 }}>No vacant units available. Create a property first.</p></div> : <>
    <div className="form-grid">
      <label>Select vacant unit <select value={selectedUnit} onChange={e => handleUnitChange(e.target.value)}>{vacantUnits.map(u => <option key={u.id} value={u.unitNumber}>{u.unitNumber} — Block {u.block}</option>)}</select></label>
      <label>Resident name <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ayesha Malik" /></label>
      <label>Phone number <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0300 1234567" /></label>
      <label>Email <input value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. ayesha@email.com (optional)" /></label>
      <label>Security Deposit (1 Month) <input type="number" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} placeholder={selectedUnitObj ? String(selectedUnitObj.monthlyCharge) : '12500'} /></label>
      <label>Advance Rent <input type="number" value={advanceRent} onChange={e => setAdvanceRent(e.target.value)} placeholder="0" /></label>
    </div>
    <p className="modal-hint">Account starts with <strong>Pending</strong> status. Security deposit auto-fills from the unit's monthly fee.</p>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={!selectedUnit || !name.trim()}>
        <CheckCircle2 data-icon="inline-start" />Assign resident</Button>
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
  const resident = residents.find(r => r.unitNumber === unitNumber)
  const [name, setName] = useState(resident?.name ?? '')
  const [phone, setPhone] = useState(resident?.phone ?? '')
  const [occupancy, setOccupancy] = useState<'Occupied' | 'Vacant'>('Occupied')
  const [status, setStatus] = useState<import('@/lib/society-context').Resident['status']>(resident?.status ?? 'Pending')

  const handleSubmit = () => {
    if (!name.trim()) return
    updateResident(unitNumber, {
      name: name.trim(),
      phone: phone.trim(),
      occupancy,
      status,
    })
    onSuccess(occupancy === 'Vacant' ? `Resident removed from ${unitNumber} — unit now Vacant` : `${name.trim()} updated for ${unitNumber}`)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">{unitNumber}</p><h2>Edit resident</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    <div className="form-grid">
      <label>Resident name <input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Phone number <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0300 1234567" /></label>
      <label>Unit status <select value={occupancy} onChange={e => setOccupancy(e.target.value as 'Occupied' | 'Vacant')}><option value="Occupied">Occupied</option><option value="Vacant">Vacant (remove resident)</option></select></label>
      <label>Payment / Account Status <select value={status} onChange={e => setStatus(e.target.value as import('@/lib/society-context').Resident['status'])}><option value="Pending">Pending</option><option value="Paid">Paid</option><option value="Partial">Partial</option><option value="Overdue">Overdue</option></select></label>
    </div>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={!name.trim()}><CheckCircle2 data-icon="inline-start" />Save changes</Button>
    </div>
  </div></div>
}

function CheckoutModal({ unitNumber, close, onSuccess }: { unitNumber: string; close: () => void; onSuccess: (msg: string) => void }) {
  const { residents, checkoutResident } = useSociety()
  const resident = residents.find(r => r.unitNumber === unitNumber)
  const deposit = resident?.securityDeposit ?? 0
  const outstanding = resident?.outstandingBalance ?? 0

  if (!resident) return null

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
    <div className="modal-head"><div><p className="eyebrow">Lease termination</p><h2>Checkout {resident.name}</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
    <div style={{ padding: '22px 24px' }}>
      <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Unit</span><strong style={{ fontSize: 12 }}>{unitNumber}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Security Deposit</span><strong style={{ fontSize: 12 }}>{fmt(deposit)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Outstanding Balance</span><strong style={{ fontSize: 12, color: outstanding > 0 ? 'var(--danger)' : 'var(--primary)' }}>{fmt(outstanding)}</strong></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button style={{ width: '100%', padding: '14px 16px', border: '1px solid var(--primary)', borderRadius: 8, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: '.15s' }} onClick={() => { checkoutResident(unitNumber, 'refund'); onSuccess(`Deposit of ${fmt(deposit)} refunded to ${resident.name}. Unit ${unitNumber} is now Vacant.`) }}>
          <strong style={{ fontSize: 13, color: 'var(--primary)' }}>Full Refund</strong><br />
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Return the full security deposit and set unit to Vacant.</span>
        </button>
        <button style={{ width: '100%', padding: '14px 16px', border: '1px solid var(--danger)', borderRadius: 8, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: '.15s' }} onClick={() => { checkoutResident(unitNumber, 'forfeit'); const settlement = Math.min(deposit, outstanding); const retained = deposit - settlement; onSuccess(`Deposit of ${fmt(deposit)} ${retained > 0 ? 'retained (damages/notice)' : 'applied to rent'}. ${unitNumber} is now Vacant.`) }}>
          <strong style={{ fontSize: 13, color: 'var(--danger)' }}>Forfeit / Retain Deposit</strong><br />
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{outstanding > 0 ? `Apply ${fmt(Math.min(deposit, outstanding))} toward outstanding rent, retain ${fmt(deposit - Math.min(deposit, outstanding))}.` : `Retain ${fmt(deposit)} for missing notice or damages.`}</span>
        </button>
      </div>
    </div>
    <div className="modal-actions">
      <Button variant="outline" onClick={close}>Cancel</Button>
    </div>
  </div></div>
}

export default function Page() {
  const { residents: ctxResidents, payments: ctxPayments, overdueResidents: ctxOverdue, sendReminder, recordPayment, currentTier, setTier, adminName, setAdminName, currentSociety } = useSociety()
  const [view, setView] = useState<View>('Dashboard'); const [mobileNav, setMobileNav] = useState(false); const [modal, setModal] = useState<Modal>(null); const [notice, setNotice] = useState(''); const [query, setQuery] = useState(''); const [trend, setTrend] = useState<'collection' | 'outstanding'>('collection'); const [profileModal, setProfileModal] = useState(false); const [societyModal, setSocietyModal] = useState(false); const [notificationsModal, setNotificationsModal] = useState(false);  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); const [editingUnit, setEditingUnit] = useState<string | null>(null); const [editingResident, setEditingResident] = useState<string | null>(null)

  const residentRows = useMemo(() => ctxResidents.map(r => [r.unitNumber, r.name, r.phone, fmt(r.outstandingBalance), r.status]), [ctxResidents])
  const paymentRows = useMemo(() => ctxPayments.map(p => [p.receiptId, p.residentName, p.unitNumber, fmt(p.amount), p.date, p.method]), [ctxPayments])
  const filteredResidentRows = useMemo(() => residentRows.filter(row => row.join(' ').toLowerCase().includes(query.toLowerCase())), [query, residentRows])

  const open = (value: Exclude<Modal, null>) => setModal(value)
  const notify = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 3000) }
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="brand"><div className="brand-mark"><Building2 size={19} /></div><span className="brand-text">Society <b>Manager</b></span><button className="sidebar-toggle icon-button" onClick={() => { if (mobileNav) setMobileNav(false); else setSidebarCollapsed(s => !s) }} aria-label="Toggle sidebar" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}</button></div>
      <div className="society-switch clickable" onClick={() => setSocietyModal(true)}><div className="society-icon"><Home size={16} /></div><div><small>Current society</small><strong>{currentSociety.name.split(' ').slice(0, 2).join(' ')}</strong></div><ChevronDown size={15} /></div>
      <p className="nav-label">Workspace</p><nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'nav-item active' : 'nav-item'} onClick={() => { setView(label); setMobileNav(false) }} title={sidebarCollapsed ? label : undefined}><Icon size={18} /><span className="nav-label-text">{label}</span>{label === 'Reminders' && <span className="nav-count">{ctxOverdue.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" title={sidebarCollapsed ? 'Help & support' : undefined}><HelpCircle size={18} /><span className="nav-label-text">Help & support</span></button><div className="profile clickable" onClick={() => setProfileModal(true)} title={sidebarCollapsed ? `${adminName} — Administrator` : 'Edit profile'}><div className="avatar">{adminName.split(' ').map(n => n[0]).join('').toUpperCase()}</div><div className="profile-info"><strong>{adminName}</strong><small>Administrator</small></div><MoreHorizontal size={17} className="profile-more" /></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="crumb"><span>Society Manager</span><b>/</b><strong>{view}</strong></div><div className="top-actions"><select className="tier-select" value={currentTier} onChange={e => setTier(e.target.value as SubscriptionTier)}><option value="TIER_1">T1 Basic</option><option value="TIER_2">T2 Pro</option><option value="TIER_3">T3 Enterprise</option></select><div className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search anything..." /><kbd>⌘ K</kbd></div><button className="icon-button notification" aria-label="Notifications" onClick={() => setNotificationsModal(true)}><Bell size={18} /><i /></button><div className="top-avatar clickable" onClick={() => setProfileModal(true)} title="Edit profile">{adminName.split(' ').map(n => n[0]).join('').toUpperCase()}</div></div></header>
      <div className="page-wrap">
        {notice && <div className="toast"><CheckCircle2 size={17} />{notice}</div>}
        {view === 'Dashboard' ? <Dashboard trend={trend} setTrend={setTrend} open={open} /> : <SectionView view={view} query={query} filteredResidentRows={filteredResidentRows} paymentRows={paymentRows} open={open} notify={notify} onEditUnit={(id) => { setEditingUnit(id); setModal('editProperty') }} onEditResident={(unitNum) => { setEditingResident(unitNum); setModal('editResident') }} onCheckout={(unitNum) => { setEditingResident(unitNum); setModal('checkout') }} />}
      </div>
    </main>
    {modal === 'payment' && <RecordPaymentModal close={() => setModal(null)} onSuccess={(msg) => { setModal(null); notify(msg) }} />}
    {modal === 'charges' && <GenerateChargesModal close={() => setModal(null)} onSuccess={(msg) => { setModal(null); notify(msg) }} />}
    {modal === 'property' && <PropertyModal close={() => setModal(null)} onSuccess={(msg) => { setModal(null); notify(msg) }} />}
    {modal === 'resident' && <AddResidentModal close={() => setModal(null)} onSuccess={(msg) => { setModal(null); notify(msg) }} />}
    {modal === 'editProperty' && editingUnit && <EditPropertyModal unitId={editingUnit} close={() => { setModal(null); setEditingUnit(null) }} onSuccess={(msg) => { setModal(null); setEditingUnit(null); notify(msg) }} />}
    {modal === 'editResident' && editingResident && <EditResidentModal unitNumber={editingResident} close={() => { setModal(null); setEditingResident(null) }} onSuccess={(msg) => { setModal(null); setEditingResident(null); notify(msg) }} />}
    {modal === 'checkout' && editingResident && <CheckoutModal unitNumber={editingResident} close={() => { setModal(null); setEditingResident(null) }} onSuccess={(msg) => { setModal(null); setEditingResident(null); notify(msg) }} />}
    {profileModal && <EditProfileModal initialName={adminName} onSaveName={setAdminName} close={() => setProfileModal(false)} onSuccess={(msg) => { setProfileModal(false); notify(msg) }} />}
    {societyModal && <SocietySwitcherModal close={() => setSocietyModal(false)} onSuccess={(msg) => { setSocietyModal(false); notify(msg) }} />}
    {notificationsModal && <NotificationsModal close={() => setNotificationsModal(false)} />}
  </div>
}

function Dashboard({ trend, setTrend, open }: { trend: 'collection' | 'outstanding'; setTrend: (v: 'collection' | 'outstanding') => void; open: (v: Exclude<Modal, null>) => void }) {
  const { payments: ctxPayments, overdueResidents: ctxOverdue, canBatchGenerate, canSendAutomatedReminders, currentTier, adminName, currentSociety, stats } = useSociety()
  const paymentRows = useMemo(() => ctxPayments.map(p => [p.receiptId, p.residentName, p.unitNumber, fmt(p.amount), p.date, p.method]), [ctxPayments])

  return <><div className="page-heading"><div><p className="eyebrow">Wednesday, 20 August 2026</p><h1>Good morning, {adminName.split(' ')[0]}</h1><p className="muted">Here&apos;s what&apos;s happening with your society today.</p></div><div className="heading-actions"><Button variant="outline" disabled={!canSendAutomatedReminders} onClick={() => open('reminder')}><Send data-icon="inline-start" />Send reminder{!canSendAutomatedReminders && <span className="upgrade-hint">Upgrade to T2</span>}</Button><Button disabled={!canBatchGenerate} onClick={() => open('charges')}><Plus data-icon="inline-start" />Generate charges{!canBatchGenerate && <span className="upgrade-hint">Upgrade to T2</span>}</Button><span className="tier-current-badge">{currentTier === 'TIER_1' ? 'T1 Basic' : currentTier === 'TIER_2' ? 'T2 Pro' : 'T3 Enterprise'}</span></div></div>
    <div className="kpi-grid"><Kpi title="Total collection" value={fmt(stats.totalCollection)} change={stats.totalCollection > 0 ? '12.8%' : '—'} icon={CircleDollarSign} color="teal" /><Kpi title="Outstanding balance" value={fmt(stats.totalOutstanding)} change={stats.totalOutstanding > 0 ? '8.4%' : '—'} icon={WalletCards} color="amber" down /><Kpi title="Collection rate" value={`${stats.collectionRate}%`} change={stats.totalInvoiced > 0 ? '5.2%' : '—'} icon={TrendingUp} color="blue" /><Kpi title="Overdue accounts" value={String(stats.overdueCount)} change={stats.overdueCount > 0 ? `${stats.overdueCount} active` : 'None'} icon={AlertCircle} color={stats.overdueCount > 0 ? 'red' : 'teal'} down={stats.overdueCount > 0} /></div>
    <div className="tier-info-bar"><ShieldCheck size={14} /><span><strong>{currentTier === 'TIER_1' ? 'T1 Basic' : currentTier === 'TIER_2' ? 'T2 Pro' : 'T3 Enterprise'}</strong> plan active — {currentTier === 'TIER_1' ? 'Batch billing & automated reminders locked' : currentTier === 'TIER_2' ? 'Multi-society & audit logs locked' : 'All features unlocked'}</span></div>
    <div className="dashboard-grid"><section className="panel trend-panel"><div className="panel-head"><div><h2>Collection overview</h2><p>Monthly financial performance</p></div><div className="toggle"><button className={trend === 'collection' ? 'selected' : ''} onClick={() => setTrend('collection')}>Collected</button><button className={trend === 'outstanding' ? 'selected' : ''} onClick={() => setTrend('outstanding')}>Outstanding</button></div></div><div className="chart-meta"><strong>{trend === 'collection' ? fmt(stats.totalCollection) : fmt(stats.totalOutstanding)}</strong><span className="positive"><ArrowUpRight size={14} /> {trend === 'collection' ? (stats.totalCollection > 0 ? '12.8%' : '0%') : (stats.totalOutstanding > 0 ? '8.4%' : '0%')} vs last month</span></div><div className="chart"><div className="chart-y"><span>{fmt(Math.max(stats.totalCollection, stats.totalOutstanding, 1) * 1.2).replace('PKR ', '')}</span><span>{fmt(Math.max(stats.totalCollection, stats.totalOutstanding, 1) * 0.8).replace('PKR ', '')}</span><span>{fmt(Math.max(stats.totalCollection, stats.totalOutstanding, 1) * 0.4).replace('PKR ', '')}</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-label="Collection trend chart"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity=".22" /><stop offset="1" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs><path d="M0,166 C45,146 60,154 100,130 S170,145 200,112 S265,124 300,98 S360,115 400,84 S455,105 500,67 S565,89 600,49 S670,62 700,28 L700,220 L0,220 Z" fill="url(#fill)" /><path d="M0,166 C45,146 60,154 100,130 S170,145 200,112 S265,124 300,98 S360,115 400,84 S455,105 500,67 S565,89 600,49 S670,62 700,28" fill="none" stroke="var(--primary)" strokeWidth="3" /></svg><div className="chart-x"><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span></div></div></div></section>
      <section className="panel breakdown"><div className="panel-head"><div><h2>Payment status</h2><p>{stats.totalInvoiceCount > 0 ? `${stats.totalInvoiceCount} invoices across society` : 'No invoices yet'}</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="donut-wrap"><div className="donut" style={{ background: stats.totalInvoiceCount > 0 ? `conic-gradient(var(--primary) 0 ${stats.paidPercent}%, var(--warning) ${stats.paidPercent}% ${stats.paidPercent + stats.partialPercent}%, var(--danger) ${stats.paidPercent + stats.partialPercent}% 100%)` : 'var(--border)' }}><div><strong>{stats.totalInvoiceCount}</strong><span>Invoices</span></div></div><div className="legend"><Legend color="var(--primary)" label="Paid" value={`${stats.paidPercent}%`} /><Legend color="var(--warning)" label="Partial" value={`${stats.partialPercent}%`} /><Legend color="var(--danger)" label="Overdue" value={`${stats.overduePercent}%`} /></div></div><div className="breakdown-foot"><span><CheckCircle2 size={15} />{stats.paidInvoiceCount} paid</span><span><Clock3 size={15} />{stats.totalInvoiceCount - stats.paidInvoiceCount - stats.overdueInvoiceCount} pending</span></div></section></div>
    <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h2>Recent payments</h2><p>Latest transactions across {currentSociety.name.split(' ')[0]} {currentSociety.name.split(' ')[1]}</p></div><Button variant="ghost" size="sm" onClick={() => open('payment')}>View all <ArrowUpRight data-icon="inline-end" /></Button></div><DataTable headers={['Receipt', 'Resident', 'Unit', 'Amount', 'Date', 'Method']} rows={paymentRows} /></section><section className="panel attention"><div className="panel-head"><div><h2>Needs attention</h2><p>Accounts that need follow-up</p></div><span className="count-badge">{ctxOverdue.length}</span></div>{ctxOverdue.length === 0 ? <div className="empty-state" style={{ padding: '24px 20px' }}><AlertCircle size={28} strokeWidth={1.5} color="var(--muted-foreground)" /><p style={{ margin: '8px 0 0', fontSize: 12 }}>No overdue accounts — all residents are up to date.</p></div> : ctxOverdue.slice(0, 3).map(item => <div className="attention-row" key={item.id}><div className="unit-avatar">{item.unitNumber.slice(0, 1)}</div><div className="attention-name"><strong>{item.name}</strong><span>{item.unitNumber} · {item.daysOverdue} days overdue</span></div><strong className="amount">{fmt(item.balance)}</strong><button className="small-send" onClick={() => open('reminder')} aria-label={`Remind ${item.name}`}><Send size={14} /></button></div>)}<Button variant="outline" className="full-button" onClick={() => open('reminder')}>View all reminders</Button></section></div>
  </>
}
function Kpi({ title, value, change, icon: Icon, color, down }: { title: string; value: string; change: string; icon: typeof Home; color: string; down?: boolean }) { return <div className="kpi"><div className={`kpi-icon ${color}`}><Icon size={19} /></div><p>{title}</p><strong>{value}</strong><span className={down ? 'change positive' : 'change'}>{down ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{change} <em>vs last month</em></span></div> }
function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div className="legend-row"><span className="legend-dot" style={{ background: color }} /><span>{label}</span><strong>{value}</strong></div> }
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="table-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, i) => <td key={cell}>{i === 1 ? <strong>{cell}</strong> : i === 3 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table></div> }


function SectionView({ view, query, filteredResidentRows, paymentRows, open, notify, onEditUnit, onEditResident, onCheckout }: { view: View; query: string; filteredResidentRows: string[][]; paymentRows: string[][]; open: (v: Exclude<Modal, null>) => void; notify: (msg: string) => void; onEditUnit: (unitId: string) => void; onEditResident: (unitNumber: string) => void; onCheckout: (unitNumber: string) => void }) {
  const { units, residents, payments: ctxPayments, overdueResidents, invoices: ctxInvoices, auditLogs, sendReminder, canSendAutomatedReminders, canAccessAdvancedReports, canAccessAuditLogs, currentTier, setTier, currentSociety, refreshData, deleteUnit, deletePayment, stats } = useSociety()
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<'success' | 'error' | null>(null)
  const [seedDetail, setSeedDetail] = useState('')
  const handleSeed = async () => {
    setSeeding(true); setSeedMsg(null); setSeedDetail('')
    console.log('[Seed Database] Starting…')
    try {
      const r = await seedDatabase()
      console.log('[Seed Database] Done:', r)
      await refreshData()
      setSeedMsg('success')
      setSeedDetail(`${r.units} units, ${r.invoices} invoices, ${r.payments} payments seeded.`)
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
  const config: Record<View, { title: string; subtitle: string; action?: Exclude<Modal, null> }> = { Properties: { title: 'Properties', subtitle: 'Manage units, blocks, and occupancy across your society.', action: 'property' }, Residents: { title: 'Residents', subtitle: 'Keep resident contacts and account status up to date.', action: 'resident' }, Billing: { title: 'Billing & charges', subtitle: 'Create monthly invoices and monitor what is due.', action: 'charges' }, Payments: { title: 'Payments', subtitle: 'Review incoming payments and receipts.', action: 'payment' }, Reminders: { title: 'Payment reminders', subtitle: 'Follow up with residents who have outstanding balances.', action: 'reminder' }, Reports: { title: 'Reports', subtitle: 'Understand collections and society performance.', action: undefined }, Settings: { title: 'Settings', subtitle: 'Configure your society and administrator preferences.', action: undefined }, Dashboard: { title: 'Dashboard', subtitle: '', action: undefined } }
  const c = config[view]

  if (view === 'Settings') {
    return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>{c.title}</h1><p className="muted">{c.subtitle}</p></div></div>
      <div className="settings-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Society Profile</h2><p>Basic information about your society</p></div></div>
          <div className="settings-section">
            <div className="settings-row"><span className="settings-label">Society Name</span><span className="settings-value">{currentSociety.name}</span></div>
            <div className="settings-row"><span className="settings-label">Address</span><span className="settings-value">{currentSociety.address}</span></div>
            <div className="settings-row"><span className="settings-label">Total Units</span><span className="settings-value">{units.length}</span></div>
            <div className="settings-row"><span className="settings-label">Currency</span><span className="settings-value">PKR</span></div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Billing Settings</h2><p>Configure billing defaults and due dates</p></div></div>
          <div className="settings-section">
            <div className="settings-row"><span className="settings-label">Default Maintenance Fee</span><span className="settings-value">PKR 12,500</span></div>
            <div className="settings-row"><span className="settings-label">Due Day</span><span className="settings-value">10th</span></div>
            <div className="settings-row"><span className="settings-label">Late Fee</span><span className="settings-value">5%</span></div>
          </div>
        </div>
      </div>
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
            </ul>
            {currentTier !== 'TIER_1' ? <div className="pricing-current">Current Plan</div> : <Button size="sm" className="pricing-upgrade-btn" onClick={() => { if (confirm('Upgrade to T2 Pro (PKR 3,000/mo)? Batch billing, WhatsApp automation, and advanced reports will be unlocked.')) { setTier('TIER_2'); notify('Upgraded to T2 Pro! Features unlocked.') } }}>Upgrade to T2 Pro</Button>}
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
            </ul>
            {currentTier === 'TIER_2' ? <Button size="sm" className="pricing-upgrade-btn" onClick={() => { if (confirm('Upgrade to T3 Enterprise (PKR 5,000/mo)? Multi-society management and audit logs will be unlocked.')) { setTier('TIER_3'); notify('Upgraded to T3 Enterprise! All features unlocked.') } }}>Upgrade to T3 Enterprise</Button> : currentTier === 'TIER_3' ? <div className="pricing-current">Current Plan</div> : <Button size="sm" variant="outline" className="pricing-upgrade-btn" onClick={() => { if (confirm('Upgrade to T3 Enterprise (PKR 5,000/mo)? All features including multi-society and audit logs will be unlocked.')) { setTier('TIER_3'); notify('Upgraded to T3 Enterprise! All features unlocked.') } }}>Upgrade to T3 Enterprise</Button>}
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
            </ul>
            {currentTier === 'TIER_3' ? <div className="pricing-current">Current Plan</div> : <Button size="sm" variant="outline" className="pricing-upgrade-btn" onClick={() => { if (confirm('Upgrade to T3 Enterprise (PKR 5,000/mo)? All features including multi-society and audit logs will be unlocked.')) { setTier('TIER_3'); notify('Upgraded to T3 Enterprise! All features unlocked.') } }}>Upgrade to T3 Enterprise</Button>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Developer Tools</h2><p>Manage seed data for testing</p></div></div>
        <div className="settings-section">
          <div className="settings-row"><span className="settings-label">Reset &amp; Seed Demo Data</span><div className="seed-actions"><Button type="button" variant="outline" size="sm" className="seed-btn" onClick={handleSeed} disabled={seeding}>{seeding ? <><span className="seed-spinner" />Seeding…</> : 'Seed Database'}</Button>{seedMsg === 'success' && <span className="seed-msg seed-success">✓ {seedDetail}</span>}{seedMsg === 'error' && <span className="seed-msg seed-error">✗ {seedDetail}</span>}</div></div>
        </div>
      </div>

      {canAccessAuditLogs && auditLogs.length > 0 && <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Audit Logs</h2><p>Security audit trail (last 100 entries)</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Timestamp</th><th>Action</th><th>Performed By</th><th>Metadata</th></tr></thead><tbody>
          {auditLogs.map(log => <tr key={log.id}><td>{new Date(log.timestamp).toLocaleString()}</td><td><span className="status status-paid"><span className="status-dot" />{log.action}</span></td><td>{log.performedBy}</td><td><code className="audit-meta">{JSON.stringify(log.metadata)}</code></td></tr>)}
        </tbody></table></div>
      </div>}

      {!canAccessAuditLogs && <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Audit Logs</h2><p>Security audit trail</p></div></div>
        <div className="upgrade-banner"><ShieldCheck size={20} /><p>Upgrade to T3 Enterprise (PKR 5,000/mo) to view security audit logs.</p></div>
      </div>}
    </>
  }

  if (view === 'Reports') {
    return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p>
      <h1>{c.title}</h1>
      <p className="muted">{c.subtitle}</p>
    </div></div>
      <div className="kpi-grid">
        <Kpi title="Total Invoiced" value={fmt(stats.totalInvoiced)} change="8.2%" icon={Receipt} color="teal" />
        <Kpi title="Total Collected" value={fmt(stats.totalCollection)} change="12.8%" icon={CircleDollarSign} color="blue" />
        <Kpi title="Total Outstanding" value={fmt(stats.totalOutstanding)} change="4.1%" icon={WalletCards} color="amber" down />
        <Kpi title="Collection Rate" value={`${stats.collectionRate}%`} change="5.2%" icon={TrendingUp} color="teal" />
      </div>
      <div className="report-cards-grid">
        <div className="report-card"><FileText size={18} color="var(--primary)" /><h3>Monthly Collection Ledger <span className="tier-badge-inline">T1</span></h3><p>Track month-by-month income and outstanding amounts across all units.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>
        <div className="report-card"><AlertCircle size={18} color="var(--danger)" /><h3>Defaulters Aging Report <span className="tier-badge-inline">T1</span></h3><p>Identify overdue accounts grouped by how long they have been outstanding.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>
        {!canAccessAdvancedReports && <div className="upgrade-banner"><ShieldCheck size={20} /><p>Upgrade to {currentTier === 'TIER_1' ? 'T2 Pro (PKR 3,000/mo)' : 'unlock this feature'} for advanced reports.</p></div>}
        {canAccessAdvancedReports && <div className="report-card"><Building2 size={18} color="var(--primary)" /><h3>Unit-Wise Revenue <span className="tier-badge-inline">T2</span></h3><p>Revenue breakdown per unit block for targeted financial analysis.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>}
        {canAccessAdvancedReports && <div className="report-card"><CheckCircle2 size={18} color="var(--primary)" /><h3>Payment Reconciliation <span className="tier-badge-inline">T2</span></h3><p>Verify recorded payments against bank statements and detect discrepancies.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>}
        {!canAccessAuditLogs && <div className="report-card locked-card"><Lock size={18} color="var(--muted-foreground)" /><h3>Audit Logs <span className="tier-badge-inline tier-t3">T3</span></h3><p>Security audit trail for all financial actions and access events.</p><div className="locked-card-overlay"><Lock size={16} />T3 Enterprise (PKR 5,000/mo)</div></div>}
        {canAccessAuditLogs && <div className="report-card"><ShieldCheck size={18} color="var(--primary)" /><h3>Audit Logs <span className="tier-badge-inline tier-t3">T3</span></h3><p>Security audit trail for all financial actions and access events.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>}
        {!canAccessAuditLogs && <div className="report-card locked-card"><Landmark size={18} color="var(--muted-foreground)" /><h3>Bank Reconciliation <span className="tier-badge-inline tier-t3">T3</span></h3><p>Match recorded payments against bank statement imports.</p><div className="locked-card-overlay"><Lock size={16} />T3 Enterprise (PKR 5,000/mo)</div></div>}
        {canAccessAuditLogs && <div className="report-card"><Landmark size={18} color="var(--primary)" /><h3>Bank Reconciliation <span className="tier-badge-inline tier-t3">T3</span></h3><p>Match recorded payments against bank statement imports.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>}
        {!canAccessAuditLogs && <div className="report-card locked-card"><Receipt size={18} color="var(--muted-foreground)" /><h3>Custom Receipts <span className="tier-badge-inline tier-t3">T3</span></h3><p>Generate branded PDF receipts with custom templates and logos.</p><div className="locked-card-overlay"><Lock size={16} />T3 Enterprise (PKR 5,000/mo)</div></div>}
        {canAccessAuditLogs && <div className="report-card"><Receipt size={18} color="var(--primary)" /><h3>Custom Receipts <span className="tier-badge-inline tier-t3">T3</span></h3><p>Generate branded PDF receipts with custom templates and logos.</p><div className="report-card-actions"><Button variant="outline" size="sm"><Download data-icon="inline-start" />Export CSV</Button><Button variant="outline" size="sm"><Download data-icon="inline-start" />Download PDF</Button></div></div>}
      </div>
    </>
  }

  if (view === 'Reminders') {
    return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>{c.title}</h1><p className="muted">{c.subtitle}</p></div><Button onClick={() => open('reminder')}><Plus data-icon="inline-start" />Send reminder</Button></div>
      <div className="tier-comparison-banner">
        <div className={`tier-comp-col clickable ${currentTier === 'TIER_1' ? 'active' : ''}`} onClick={() => setTier('TIER_1')}><span className="tier-comp-label">T1 Basic</span><p>Manual SMS</p><span className="tier-comp-price">PKR 1,500/mo</span>{currentTier === 'TIER_1' && <span className="tier-active-check">✓ Active</span>}</div>
        <div className={`tier-comp-col clickable ${currentTier === 'TIER_2' ? 'active' : ''}`} onClick={() => setTier('TIER_2')}><span className="tier-comp-label">T2 Pro</span><p>WhatsApp Automation</p><span className="tier-comp-price">PKR 3,000/mo</span>{currentTier === 'TIER_2' && <span className="tier-active-check">✓ Active</span>}</div>
        <div className={`tier-comp-col clickable ${currentTier === 'TIER_3' ? 'active' : ''}`} onClick={() => setTier('TIER_3')}><span className="tier-comp-label">T3 Enterprise</span><p>Priority Bulk WhatsApp API</p><span className="tier-comp-price">PKR 5,000/mo</span>{currentTier === 'TIER_3' && <span className="tier-active-check">✓ Active</span>}</div>
      </div>
      <section className="panel list-panel">
        <div className="panel-head"><div><h2>Overdue residents</h2><p>{overdueResidents.length} account{overdueResidents.length !== 1 ? 's' : ''} with outstanding balances in {currentSociety.name}</p></div></div>
        {overdueResidents.length === 0 ? (
          <div className="empty-state"><AlertCircle size={40} strokeWidth={1.5} color="var(--muted-foreground)" /><h3>No overdue accounts found for this society</h3><p>All residents are up to date with their payments.</p></div>
        ) : (
          <div className="table-scroll"><table><thead><tr><th>Resident Name</th><th>Unit #</th><th>Outstanding Balance</th><th>Days Overdue</th><th>Last Reminder</th><th>Action</th></tr></thead><tbody>
            {overdueResidents.map(r => <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.unitNumber}</td><td><strong>{fmt(r.balance)}</strong></td><td><span className="status status-overdue"><span className="status-dot" />{r.daysOverdue} days</span></td><td>{r.lastReminderDate || '—'}</td><td>{canSendAutomatedReminders ? <button className="whatsapp-btn" onClick={() => sendReminder(r.id)}><Send size={12} />Send WhatsApp Reminder</button> : <span className="locked-hint"><Lock size={11} />Upgrade to T2</span>}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </>
  }

  const handleDeleteUnit = (unitId: string, label: string) => {
    if (!confirm(`Delete ${label}? This action cannot be undone.`)) return
    deleteUnit(unitId).then(() => notify(`Deleted ${label} successfully.`))
  }
  const handleDeletePayment = (paymentId: string, label: string) => {
    if (!confirm(`Delete payment ${label}? This action cannot be undone.`)) return
    deletePayment(paymentId).then(() => notify(`Deleted payment ${label} successfully.`))
  }

  return <><div className="page-heading"><div><p className="eyebrow">{currentSociety.name}</p><h1>{c.title}</h1><p className="muted">{c.subtitle}</p></div>{c.action && <Button onClick={() => open(c.action!)}><Plus data-icon="inline-start" />{c.action === 'charges' ? 'Generate charges' : c.action === 'payment' ? 'Record payment' : c.action === 'reminder' ? 'Send reminder' : c.action === 'property' ? 'Add property' : 'Add resident'}</Button>}</div><div className="sub-kpis"><Kpi title="Total records" value={view === 'Residents' ? String(filteredResidentRows.length) : String(units.length)} change="6.2%" icon={view === 'Residents' ? Users : Building2} color="teal" /><Kpi title="Active / paid" value={view === 'Residents' ? String(filteredResidentRows.length) : String(stats.paidCount)} change="12.8%" icon={CheckCircle2} color="blue" /><Kpi title="Needs attention" value={fmt(stats.totalOutstanding)} change="3.4%" icon={AlertCircle} color="amber" down /></div><section className="panel list-panel"><div className="panel-head"><div><h2>{view === 'Residents' ? 'Resident directory' : view === 'Payments' ? 'Payment history' : `${c.title} overview`}</h2><p>{query ? `Showing results for \u201c${query}\u201d` : 'Updated a few moments ago'}</p></div><div className="list-actions"><button className="filter-button"><SlidersHorizontal size={15} />Filters</button><button className="filter-button"><Download size={15} />Export</button></div></div>
      <div className="table-scroll"><table><thead><tr>
        {view === 'Residents' && <><th>Unit</th><th>Resident</th><th>Phone</th><th>Outstanding</th><th>Status</th><th>Actions</th></>}
        {view === 'Payments' && <><th>Receipt</th><th>Resident</th><th>Unit</th><th>Amount</th><th>Date</th><th>Method</th><th>Actions</th></>}
        {view === 'Properties' && <><th>Unit</th><th>Type</th><th>Location / Block</th><th>Occupancy</th><th>Monthly Charge</th><th>Actions</th></>}
        {view === 'Billing' && <><th>Unit</th><th>Resident</th><th>Status</th><th>Monthly Charge</th><th>Arrears</th><th>Total Paid</th><th>Remaining Dues</th><th>Actions</th></>}
      </tr></thead><tbody>
        {view === 'Residents' && filteredResidentRows.map(row => {
          const resident = residents.find(r => r.unitNumber === row[0])
          return <tr key={row[0]}>
            <td>{row[0]}</td><td><strong>{row[1]}</strong></td><td>{row[2]}</td><td><strong>{row[3]}</strong></td>
            <td><Status>{row[4]}</Status></td>
            <td className="row-actions">
              <button className="action-btn action-edit" title="Edit resident" onClick={() => onEditResident(row[0])}><Pencil size={13} /></button>
              {resident && (resident.securityDeposit ?? 0) > 0 && <button className="action-btn action-checkout" title="Checkout / Terminate Lease" onClick={() => onCheckout(row[0])}><AlertCircle size={13} /></button>}
              <button className="action-btn action-delete" title="Delete" onClick={() => { if (!resident) return; if (!confirm(`Delete resident ${resident.name}?`)) return; deleteUnit(resident.unitNumber).then(() => notify(`Deleted ${resident.name}.`)) }}><X size={13} /></button>
            </td>
          </tr>
        })}
        {view === 'Payments' && ctxPayments.map(p => <tr key={p.id}>
          <td>{p.receiptId}</td><td><strong>{p.residentName}</strong></td><td>{p.unitNumber}</td><td><strong>{fmt(p.amount)}</strong></td><td>{p.date}</td><td>{p.method}</td>
          <td className="row-actions">
            <button className="action-btn action-view" title="View Details"><FileText size={13} /></button>
            <button className="action-btn action-delete" title="Delete" onClick={() => handleDeletePayment(p.id, p.receiptId)}><X size={13} /></button>
          </td>
        </tr>)}
        {view === 'Properties' && units.map(u => {
          return <tr key={u.id}>
            <td>{u.unitNumber}</td><td>{u.type}</td><td>{`${currentSociety.name.split(' ')[0]} Block ${u.block}`}</td><td><Status>{u.occupancy}</Status></td><td><strong>{fmt(u.monthlyCharge)}</strong></td>
            <td className="row-actions">
              <button className="action-btn action-edit" title="Edit property" onClick={() => onEditUnit(u.id)}><Pencil size={13} /></button>
              <button className="action-btn action-delete" title="Delete" onClick={() => handleDeleteUnit(u.id, u.unitNumber)}><X size={13} /></button>
            </td>
          </tr>
        })}
        {view === 'Billing' && units.filter(u => u.occupancy === 'Occupied').map(u => {
          const resident = residents.find(r => r.unitNumber === u.unitNumber)
          const unitInvoices = ctxInvoices.filter(i => i.unitNumber === u.unitNumber)
          const unpaidInvoice = unitInvoices.find(i => i.outstanding > 0 && i.status !== 'Paid')
          const latestInvoice = unitInvoices[0]
          const arrears = unpaidInvoice ? unpaidInvoice.outstanding : 0
          const totalDue = u.monthlyCharge + arrears
          const totalPaid = unitInvoices.reduce((sum, i) => sum + (i.amount - i.outstanding), 0)
          const remainingDues = Math.max(0, totalDue - totalPaid)
          const hasPaidInvoice = unitInvoices.some(i => i.status === 'Paid')
          const invoiceStatus = unpaidInvoice?.status ?? (hasPaidInvoice ? 'Paid' : 'Pending')
          const duesCleared = remainingDues === 0 && totalPaid > 0
          return <tr key={u.id}>
            <td>{u.unitNumber}</td><td><strong>{resident?.name ?? u.ownerName ?? '—'}</strong></td><td><Status>{invoiceStatus}</Status></td><td><strong>{fmt(u.monthlyCharge)}</strong></td><td>{arrears > 0 ? <strong>{fmt(arrears)}</strong> : '—'}</td><td><strong>{fmt(totalPaid)}</strong></td><td>{duesCleared ? <span className="status status-paid"><span className="status-dot" />✓ Dues Cleared</span> : <strong style={{ color: 'var(--danger)' }}>{fmt(remainingDues)}</strong>}</td>
            <td className="row-actions">
              <button className="action-btn action-pay" title="Record Payment" onClick={() => open('payment')}><CircleDollarSign size={13} /></button>
            </td>
          </tr>
        })}
      </tbody></table></div>
    </section></>
}
