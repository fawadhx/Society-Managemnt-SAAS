'use client'

/**
 * Society context — operational data for ONE workspace (the society/plaza the
 * signed-in user is currently working in).
 *
 * Source of truth: Supabase (RLS-scoped to the active society). localStorage is
 * a per-society offline cache so the UI is never blank on a slow/failed network.
 * The active society + tier come from auth-context / subscription-context — this
 * provider never decides tenancy or plan on its own.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase, isSupabaseConfigured } from './supabase'
import { useAuth } from './auth-context'
import { useSubscription } from './subscription-context'
import { TIER_INFO, type SubscriptionTier } from './plans'
import { type Lead, type LeadStatus } from './leads'
import { normalizeSite, EMPTY_SITE, type SiteContent } from './site'

export { TIER_INFO }
export type { SubscriptionTier }
export type { Lead } from './leads'
export type { SiteContent } from './site'

/* ── Types ──────────────────────────────────────────────── */

export type Unit = {
  id: string
  unitNumber: string
  type: string
  block: string
  occupancy: 'Occupied' | 'Vacant'
  monthlyCharge: number
  societyId?: string
  ownerName?: string
  phone?: string
}

export type Resident = {
  id: string
  name: string
  unitNumber: string
  phone: string
  email?: string
  outstandingBalance: number
  accountStatus: 'Pending' | 'Active' | 'Inactive'
  movedOutAt?: string
  /** Set on move-out: did the resident give proper notice before leaving? */
  leftWithNotice?: boolean
  securityDeposit?: number
  advanceRent?: number
}

export type Invoice = {
  id: string
  unitNumber: string
  residentName: string
  amount: number
  outstanding: number
  period: string
  status: 'Paid' | 'Overdue' | 'Partial' | 'Pending'
  dueDate: string
}

export type PaymentRecord = {
  id: string
  receiptId: string
  residentName: string
  unitNumber: string
  amount: number
  date: string
  method: string
  /** Pending = received but not yet cleared — does NOT reduce the bill until confirmed. */
  status: 'Pending' | 'Confirmed'
  invoiceId?: string
}

export type OverdueResident = {
  id: string
  name: string
  unitNumber: string
  phone: string
  balance: number
  daysOverdue: number
  lastReminderDate: string
  earliestDueDate?: string
}

export type AuditLog = {
  id: string
  action: string
  performedBy: string
  metadata: Record<string, unknown>
  timestamp: string
}

export type Society = {
  id: string
  name: string
  address: string
  slug?: string
  kind?: 'society' | 'plaza'
  tier?: SubscriptionTier
  defaultFee?: number
  dueDay?: number
  lateFeePct?: number
  logoUrl?: string
  primaryColor?: string
  status?: 'active' | 'suspended'
}

/* ── Derived-status helpers (single source of truth = invoices) ── */

export function normalizeResident(r: Resident): Resident {
  if (r.accountStatus) return r
  const legacy = (r as unknown as { status?: string }).status
  return { ...r, accountStatus: legacy === 'Pending' ? 'Pending' : 'Active' }
}

export function outstandingForUnit(unitNumber: string, invoices: Invoice[]): number {
  return invoices.filter(i => i.unitNumber === unitNumber).reduce((sum, i) => sum + i.outstanding, 0)
}

export function isPastDue(dueDate: string): boolean {
  const t = new Date(dueDate).getTime()
  if (Number.isNaN(t)) return false
  return t < new Date(new Date().toDateString()).getTime()
}

export type PaymentStatus = 'Paid' | 'Due' | 'Overdue' | '—'

export function paymentStatusFor(unitNumber: string, invoices: Invoice[]): PaymentStatus {
  const unitBills = invoices.filter(i => i.unitNumber === unitNumber)
  if (unitBills.length === 0) return '—'
  const unpaid = unitBills.filter(i => i.status !== 'Paid' && i.outstanding > 0)
  if (unpaid.length === 0) return 'Paid'
  return unpaid.some(i => i.status === 'Overdue' || isPastDue(i.dueDate)) ? 'Overdue' : 'Due'
}

export type InvoiceDisplayStatus = 'Paid' | 'Partially Paid' | 'Overdue' | 'Due' | 'Issued'

export function invoiceDisplayStatus(inv: Invoice): InvoiceDisplayStatus {
  if (inv.outstanding <= 0 || inv.status === 'Paid') return 'Paid'
  if (inv.status === 'Overdue' || isPastDue(inv.dueDate)) return 'Overdue'
  if (inv.amount - inv.outstanding > 0 || inv.status === 'Partial') return 'Partially Paid'
  if (isPastDue(inv.dueDate)) return 'Due'
  return 'Issued'
}

export function residentForUnit(unitNumber: string, residents: Resident[]): Resident | undefined {
  return residents.find(r => r.unitNumber === unitNumber && r.accountStatus !== 'Inactive')
    ?? residents.find(r => r.unitNumber === unitNumber)
}

/* ── Stats ──────────────────────────────────────────────── */

export type SocietyStats = {
  totalCollection: number
  totalOutstanding: number
  totalInvoiced: number
  collectionRate: number
  overdueCount: number
  unitCount: number
  occupiedUnits: number
  vacantUnits: number
  activeResidents: number
  paidCount: number
  totalInvoiceCount: number
  paidInvoiceCount: number
  partialInvoiceCount: number
  overdueInvoiceCount: number
  paidPercent: number
  partialPercent: number
  overduePercent: number
}

const ZERO_STATS: SocietyStats = {
  totalCollection: 0, totalOutstanding: 0, totalInvoiced: 0, collectionRate: 0,
  overdueCount: 0, unitCount: 0, occupiedUnits: 0, vacantUnits: 0, activeResidents: 0,
  paidCount: 0, totalInvoiceCount: 0, paidInvoiceCount: 0, partialInvoiceCount: 0,
  overdueInvoiceCount: 0, paidPercent: 0, partialPercent: 0, overduePercent: 0,
}

/* ── Actions / context shape ────────────────────────────── */

export type SocietyActions = {
  recordPayment: (invoiceId: string, amount: number, method: string, date?: string, status?: 'Pending' | 'Confirmed') => Promise<void>
  /** Apply a pending payment to its bill and mark it Confirmed. */
  confirmPayment: (paymentId: string) => Promise<void>
  sendReminder: (residentId: string) => Promise<void>
  generateMonthlyInvoices: (period: string, defaultAmount: number, dueDate?: string) => Promise<void>
  refreshData: (forceDb?: boolean) => Promise<void>
  switchSociety: (societyId: string) => Promise<void>
  addSociety: (name: string, address: string) => Promise<void>
  addUnit: (unitNumber: string, block: string, monthlyCharge?: number) => Promise<void>
  updateUnit: (unitId: string, updates: { unitNumber?: string; block?: string; occupancy?: 'Occupied' | 'Vacant'; monthlyCharge?: number }) => Promise<void>
  updateSociety: (updates: Partial<Pick<Society, 'name' | 'address' | 'defaultFee' | 'dueDay' | 'lateFeePct'>>) => Promise<void>
  requestPlanChange: (kind: 'tier' | 'seats', detail: string) => Promise<void>
  assignResident: (unitNumber: string, residentName: string, phone: string, opts?: { email?: string; securityDeposit?: number; billFirstMonth?: boolean; paidAtMoveIn?: number }) => Promise<void>
  updateResident: (unitNumber: string, updates: { name?: string; phone?: string; email?: string; occupancy?: 'Occupied' | 'Vacant'; accountStatus?: Resident['accountStatus']; securityDeposit?: number; advanceRent?: number }) => Promise<void>
  approveResident: (unitNumber: string) => Promise<void>
  reactivateResident: (unitNumber: string) => Promise<void>
  /** Hard-delete a resident record. Frees the unit if it was the active resident. */
  deleteResident: (residentId: string) => Promise<void>
  deleteUnit: (unitId: string) => Promise<void>
  deletePayment: (paymentId: string) => Promise<void>
  deleteSociety: (societyId: string) => Promise<void>
  checkoutResident: (unitNumber: string, opts: { noticeGiven: boolean; deductions: number }) => Promise<void>
  /* ── CRM (leads) — T3 ─────────────────────────────────── */
  addLead: (input: { name: string; phone?: string; email?: string; unitPref?: string; budget?: number; message?: string; unitId?: string }) => Promise<void>
  updateLead: (id: string, patch: Partial<Pick<Lead, 'name' | 'phone' | 'email' | 'status' | 'budget' | 'unitId' | 'unitPref' | 'notes' | 'assignedTo'>>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  /** Assign the lead to the signed-in user (team-wide assignment is deferred). */
  assignLeadToMe: (id: string) => Promise<void>
  /** Mark a lead won (called after a resident is created from it). */
  convertLead: (id: string) => Promise<void>
  /* ── CMS (public website) — T3 ────────────────────────── */
  saveSite: (content: SiteContent, published: boolean) => Promise<void>
}

type Permissions = {
  canSendAutomatedReminders: boolean
  canBatchGenerate: boolean
  canAccessAdvancedReports: boolean
  canAccessAuditLogs: boolean
  canMultiSociety: boolean
  /** true when the signed-in user is the plan owner on a multi-seat plan. */
  canManageTeam: boolean
  /** the signed-in user's access level in this workspace. */
  myAccess: 'owner' | 'editor' | 'viewer'
  isReadOnly: boolean
  atPropertyLimit: boolean
  atResidentLimit: boolean
  /** T3: CRM / leads pipeline. */
  canAccessCrm: boolean
  /** T3: public marketing website (CMS). */
  canAccessSite: boolean
}

type SocietyContextValue = {
  units: Unit[]
  residents: Resident[]
  invoices: Invoice[]
  payments: PaymentRecord[]
  overdueResidents: OverdueResident[]
  reminderLog: Record<string, string>
  auditLogs: AuditLog[]
  currentTier: SubscriptionTier
  adminName: string
  societies: Society[]
  currentSociety: Society
  stats: SocietyStats
  loading: boolean
  leads: Lead[]
  site: SiteContent
  sitePublished: boolean
  setTier: (t: SubscriptionTier) => void
  setAdminName: (name: string) => void
} & SocietyActions & Permissions

const SocietyContext = createContext<SocietyContextValue | null>(null)

const SB = isSupabaseConfigured()
const BLANK_SOCIETY: Society = { id: '_blank', name: '', address: '', tier: 'TIER_1', kind: 'society' }

/* ── localStorage cache helpers ─────────────────────────── */

const LS = 'sm_ws_'
const K = {
  units: (s: string) => `${LS}units_${s}`,
  residents: (s: string) => `${LS}residents_${s}`,
  invoices: (s: string) => `${LS}invoices_${s}`,
  payments: (s: string) => `${LS}payments_${s}`,
  audit: (s: string) => `${LS}audit_${s}`,
  reminders: (s: string) => `${LS}reminders_${s}`,
  leads: (s: string) => `${LS}leads_${s}`,
  site: (s: string) => `${LS}site_${s}`,
  demoSocieties: `${LS}demo_societies`,
}

type SiteCache = { content: SiteContent; published: boolean }

function lsLoad<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function lsSave(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* noop */ }
}

function fmtDate(d: Date) {
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`
}

let demoReceiptNum = 1000

const isUuidStr = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

function mapLead(r: Record<string, unknown>): Lead {
  return {
    id: r.id as string,
    name: (r.name as string) ?? '',
    phone: (r.phone as string) ?? '',
    email: (r.email as string) ?? undefined,
    status: ((r.status as LeadStatus) ?? 'new'),
    source: ((r.source as Lead['source']) ?? 'website'),
    budget: r.budget != null ? Number(r.budget) : undefined,
    unitId: (r.unit_id as string) ?? undefined,
    unitPref: (r.unit_pref as string) ?? '',
    message: (r.message as string) ?? '',
    assignedTo: (r.assigned_to as string) ?? undefined,
    notes: (r.notes as string) ?? '',
    convertedResidentId: (r.converted_resident_id as string) ?? undefined,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? (r.created_at as string) ?? new Date().toISOString(),
  }
}

/* ── Provider ───────────────────────────────────────────── */

export function SocietyProvider({ children }: { children: React.ReactNode }) {
  const { memberships, viewingSocietyId, isSuperAdmin, viewSociety, user, myAccess, refresh: refreshAuth } = useAuth()
  const sub = useSubscription()
  const router = useRouter()

  const [currentSociety, setCurrentSociety] = useState<Society>(BLANK_SOCIETY)
  const [units, setUnits] = useState<Unit[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [reminderLog, setReminderLog] = useState<Record<string, string>>({})
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [site, setSite] = useState<SiteContent>(EMPTY_SITE)
  const [sitePublished, setSitePublished] = useState(false)
  const [loading, setLoading] = useState(true)

  const societyRef = useRef(currentSociety)
  societyRef.current = currentSociety
  const leadsRef = useRef(leads); leadsRef.current = leads
  const siteRef = useRef(site); siteRef.current = site
  const unitsRef = useRef(units); unitsRef.current = units
  const residentsRef = useRef(residents); residentsRef.current = residents
  const invoicesRef = useRef(invoices); invoicesRef.current = invoices
  const paymentsRef = useRef(payments); paymentsRef.current = payments

  const adminName = user?.name ?? 'Administrator'
  const sid = currentSociety.id

  /* Societies the user can switch between (T3 multi-property). */
  const societies = useMemo<Society[]>(() => {
    if (SB) {
      const list: Society[] = memberships.map(m => ({ id: m.societyId, name: m.name, address: '', slug: m.slug, kind: m.kind }))
      if (isSuperAdmin && currentSociety.id !== BLANK_SOCIETY.id && !list.some(s => s.id === currentSociety.id)) {
        list.push(currentSociety)
      }
      return list
    }
    return lsLoad<Society[]>(K.demoSocieties, [])
  }, [memberships, isSuperAdmin, currentSociety])

  /* ── Load the active society's full record + data ──────── */
  const loadReqRef = useRef('')
  const loadSociety = useCallback(async (societyId: string) => {
    if (!societyId || societyId === BLANK_SOCIETY.id) { setLoading(false); return }
    loadReqRef.current = societyId
    setLoading(true)
    const sb = getSupabase()

    // Offline cache first paint
    const cachedUnits = lsLoad<Unit[]>(K.units(societyId), [])
    if (cachedUnits.length) {
      setUnits(cachedUnits)
      setResidents(lsLoad<Resident[]>(K.residents(societyId), []).map(normalizeResident))
      setInvoices(lsLoad<Invoice[]>(K.invoices(societyId), []))
      setPayments(lsLoad<PaymentRecord[]>(K.payments(societyId), []))
      setAuditLogs(lsLoad<AuditLog[]>(K.audit(societyId), []))
    }
    setLeads(lsLoad<Lead[]>(K.leads(societyId), []))
    const cachedSite = lsLoad<SiteCache | null>(K.site(societyId), null)
    setSite(cachedSite ? normalizeSite(cachedSite.content) : EMPTY_SITE)
    setSitePublished(cachedSite?.published ?? false)
    setReminderLog(lsLoad<Record<string, string>>(K.reminders(societyId), {}))

    if (!sb) {
      const demo = lsLoad<Society[]>(K.demoSocieties, []).find(s => s.id === societyId)
      if (demo) setCurrentSociety(demo)
      setLoading(false)
      return
    }

    const { data: soc } = await sb.from('societies').select('*').eq('id', societyId).single()
    if (soc && loadReqRef.current === societyId) {
      setCurrentSociety({
        id: soc.id, name: soc.name, address: soc.address ?? '', slug: soc.slug,
        kind: soc.kind ?? 'society', defaultFee: Number(soc.default_fee ?? 0),
        dueDay: soc.due_day ?? 10, lateFeePct: Number(soc.late_fee_pct ?? 0),
        logoUrl: soc.logo_url ?? undefined, primaryColor: soc.primary_color ?? undefined,
        status: soc.status ?? 'active',
      })
    }

    const { data: unitRows } = await sb.from('units').select('*').eq('society_id', societyId).order('unit_number')
    const dbUnits: Unit[] = (unitRows ?? []).map(u => ({
      id: u.id, unitNumber: u.unit_number, type: u.type ?? 'Apartment',
      block: u.block ?? (u.unit_number as string).split('-')[0] ?? 'A',
      occupancy: (u.status as 'Occupied' | 'Vacant') ?? 'Vacant',
      monthlyCharge: Number(u.monthly_charge ?? soc?.default_fee ?? 0),
      societyId, ownerName: undefined, phone: undefined,
    }))

    const { data: resRows } = await sb.from('residents').select('*').eq('society_id', societyId)
    const dbResidents: Resident[] = (resRows ?? []).map(r => {
      const unit = dbUnits.find(u => u.id === r.unit_id)
      return {
        id: r.id, name: r.name, unitNumber: unit?.unitNumber ?? '', phone: r.phone ?? '',
        email: r.email ?? undefined, outstandingBalance: 0,
        accountStatus: (r.account_status as Resident['accountStatus']) ?? 'Pending',
        movedOutAt: r.moved_out_at ?? undefined,
        leftWithNotice: r.left_with_notice ?? undefined,
        securityDeposit: Number(r.security_deposit ?? 0), advanceRent: Number(r.advance_rent ?? 0),
      }
    })
    // annotate units with the active resident's contact info
    for (const u of dbUnits) {
      const active = dbResidents.find(r => r.unitNumber === u.unitNumber && r.accountStatus !== 'Inactive')
      if (active) { u.ownerName = active.name; u.phone = active.phone }
    }

    const { data: invRows } = await sb.from('invoices').select('*').eq('society_id', societyId).order('created_at', { ascending: false })
    let dbInvoices: Invoice[] = (invRows ?? []).map(i => {
      const unit = dbUnits.find(u => u.id === i.unit_id)
      return {
        id: i.id, unitNumber: unit?.unitNumber ?? '', residentName: i.resident_name ?? unit?.ownerName ?? '',
        amount: Number(i.amount), outstanding: Number(i.outstanding), period: i.period,
        status: i.status as Invoice['status'], dueDate: i.due_date,
      }
    })
    // Lifecycle: flip Pending → Overdue once past due (persist so stats/donut are honest)
    const nowOverdue = dbInvoices.filter(i => i.outstanding > 0 && i.status === 'Pending' && isPastDue(i.dueDate))
    if (nowOverdue.length) {
      await sb.from('invoices').update({ status: 'Overdue' }).in('id', nowOverdue.map(i => i.id))
      dbInvoices = dbInvoices.map(i => nowOverdue.some(n => n.id === i.id) ? { ...i, status: 'Overdue' } : i)
    }

    const { data: payRows } = await sb.from('payments').select('*').eq('society_id', societyId).order('created_at', { ascending: false })
    const dbPayments: PaymentRecord[] = (payRows ?? []).map(p => {
      const inv = dbInvoices.find(i => i.id === p.invoice_id)
      return {
        id: p.id, receiptId: p.receipt_number, residentName: inv?.residentName ?? '',
        unitNumber: inv?.unitNumber ?? '', amount: Number(p.amount_paid),
        date: p.paid_on ? fmtDate(new Date(p.paid_on)) : fmtDate(new Date(p.created_at)),
        method: p.method, status: (p.status as PaymentRecord['status']) ?? 'Confirmed', invoiceId: p.invoice_id,
      }
    })

    let dbAudit: AuditLog[] = []
    const { data: auditRows } = await sb.from('audit_logs').select('*').eq('society_id', societyId).order('timestamp', { ascending: false }).limit(100)
    dbAudit = (auditRows ?? []).map(l => ({
      id: l.id, action: l.action, performedBy: l.performed_by,
      metadata: (typeof l.metadata === 'object' && l.metadata) ? l.metadata : {}, timestamp: l.timestamp,
    }))

    // CRM leads + CMS site (tables added for T3; tolerate their absence on old DBs).
    let dbLeads: Lead[] = leadsRef.current
    const { data: leadRows, error: leadErr } = await sb.from('leads').select('*').eq('society_id', societyId).order('created_at', { ascending: false })
    if (!leadErr) dbLeads = (leadRows ?? []).map(mapLead)

    let dbSite: SiteContent = EMPTY_SITE
    let dbSitePublished = false
    const { data: siteRow, error: siteErr } = await sb.from('society_sites').select('content, published').eq('society_id', societyId).maybeSingle()
    if (!siteErr && siteRow) { dbSite = normalizeSite(siteRow.content); dbSitePublished = !!siteRow.published }

    if (loadReqRef.current !== societyId) return // a newer switch superseded this load

    setUnits(dbUnits); setResidents(dbResidents); setInvoices(dbInvoices); setPayments(dbPayments); setAuditLogs(dbAudit)
    setLeads(dbLeads); setSite(dbSite); setSitePublished(dbSitePublished)
    lsSave(K.units(societyId), dbUnits)
    lsSave(K.residents(societyId), dbResidents)
    lsSave(K.invoices(societyId), dbInvoices)
    lsSave(K.payments(societyId), dbPayments)
    lsSave(K.audit(societyId), dbAudit)
    lsSave(K.leads(societyId), dbLeads)
    lsSave(K.site(societyId), { content: dbSite, published: dbSitePublished } satisfies SiteCache)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (SB) {
      if (viewingSocietyId) void loadSociety(viewingSocietyId)
      else { setCurrentSociety(BLANK_SOCIETY); setUnits([]); setResidents([]); setInvoices([]); setPayments([]); setAuditLogs([]); setLeads([]); setSite(EMPTY_SITE); setSitePublished(false); setLoading(false) }
    } else {
      const demo = lsLoad<Society[]>(K.demoSocieties, [])
      const active = demo[0]
      if (active) { setCurrentSociety(active); void loadSociety(active.id) } else setLoading(false)
    }
  }, [viewingSocietyId, loadSociety])

  const refreshData = useCallback(async (_forceDb?: boolean) => {
    if (societyRef.current.id !== BLANK_SOCIETY.id) await loadSociety(societyRef.current.id)
    await sub.refresh()
  }, [loadSociety, sub])

  const switchSociety = useCallback(async (societyId: string) => {
    if (SB) {
      viewSociety(societyId)
      const target = memberships.find(m => m.societyId === societyId)
      if (target?.slug) router.push(`/${target.slug}`)
      return
    }
    const demo = lsLoad<Society[]>(K.demoSocieties, []).find(s => s.id === societyId)
    if (demo) { setCurrentSociety(demo); await loadSociety(demo.id) }
  }, [viewSociety, loadSociety, memberships, router])

  /* ── Guard: block mutations when the subscription is view-only ── */
  const blocked = () => sub.isReadOnly || myAccess === 'viewer'

  const writeAudit = useCallback(async (action: string, metadata: Record<string, unknown> = {}) => {
    const sb = getSupabase()
    if (!sb || sid === BLANK_SOCIETY.id) return
    const by = user?.name || user?.email || 'system'
    const row = { society_id: sid, user_id: user?.id ?? null, action, performed_by: by, metadata }
    try {
      const { error } = await sb.from('audit_logs').insert(row)
      if (error && 'user_id' in row) { const { user_id: _u, ...rest } = row; await sb.from('audit_logs').insert(rest) }
    } catch { /* best effort */ }
    setAuditLogs(prev => [{ id: `al${Date.now()}`, action, performedBy: by, metadata, timestamp: new Date().toISOString() }, ...prev].slice(0, 100))
  }, [sid, user])

  /* ── Units ─────────────────────────────────────────────── */
  const addUnit = useCallback(async (unitNumber: string, block: string, monthlyCharge?: number) => {
    if (blocked()) return
    if (!sub.withinLimit('property', unitsRef.current.length)) return
    if (unitsRef.current.some(u => u.unitNumber.trim().toLowerCase() === unitNumber.trim().toLowerCase())) return
    const charge = monthlyCharge ?? currentSociety.defaultFee ?? 0
    const sb = getSupabase()
    let id = `u${Date.now()}`
    if (sb && sid !== BLANK_SOCIETY.id) {
      const { data } = await sb.from('units').insert({
        society_id: sid, unit_number: unitNumber, block, type: 'Apartment', monthly_charge: charge, status: 'Vacant',
      }).select('id').single()
      if (data) id = data.id
    }
    const next = [...unitsRef.current, { id, unitNumber, type: 'Apartment', block, occupancy: 'Vacant' as const, monthlyCharge: charge, societyId: sid }]
    setUnits(next); lsSave(K.units(sid), next)
    void writeAudit('UNIT_CREATED', { unitNumber, block, monthlyCharge: charge })
  }, [sub, currentSociety.defaultFee, sid, writeAudit])

  const updateUnit = useCallback(async (unitId: string, updates: { unitNumber?: string; block?: string; occupancy?: 'Occupied' | 'Vacant'; monthlyCharge?: number }) => {
    if (blocked()) return
    const next = unitsRef.current.map(u => u.id === unitId ? { ...u, ...updates } : u)
    setUnits(next); lsSave(K.units(sid), next)
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      const db: Record<string, unknown> = {}
      if (updates.unitNumber) db.unit_number = updates.unitNumber
      if (updates.block !== undefined) db.block = updates.block
      if (updates.occupancy) db.status = updates.occupancy
      if (updates.monthlyCharge !== undefined) db.monthly_charge = updates.monthlyCharge
      if (Object.keys(db).length) { try { await sb.from('units').update(db).eq('id', unitId) } catch { /* noop */ } }
    }
  }, [sid])

  const deleteUnit = useCallback(async (unitId: string) => {
    if (blocked()) return
    const target = unitsRef.current.find(u => u.id === unitId)
    if (!target) return
    const nextUnits = unitsRef.current.filter(u => u.id !== unitId)
    const nextInv = invoicesRef.current.filter(i => i.unitNumber !== target.unitNumber)
    const nextPay = paymentsRef.current.filter(p => p.unitNumber !== target.unitNumber)
    const nextRes = residentsRef.current.filter(r => r.unitNumber !== target.unitNumber)
    setUnits(nextUnits); setInvoices(nextInv); setPayments(nextPay); setResidents(nextRes)
    lsSave(K.units(sid), nextUnits); lsSave(K.invoices(sid), nextInv); lsSave(K.payments(sid), nextPay); lsSave(K.residents(sid), nextRes)
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) { try { await sb.from('units').delete().eq('id', unitId) } catch { /* noop */ } }
    void writeAudit('UNIT_DELETED', { unitNumber: target.unitNumber })
  }, [sid, writeAudit])

  const nextReceipt = useCallback(async (): Promise<string> => {
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      try { const { data } = await sb.rpc('next_receipt', { p_society: sid }); if (data) return data as string } catch { /* noop */ }
    }
    return `REC-${demoReceiptNum++}`
  }, [sid])

  /* ── Residents ─────────────────────────────────────────── */
  const assignResident = useCallback(async (unitNumber: string, residentName: string, phone: string, opts?: { email?: string; securityDeposit?: number; billFirstMonth?: boolean; paidAtMoveIn?: number }) => {
    if (blocked()) return
    const activeResidents = residentsRef.current.filter(r => r.accountStatus !== 'Inactive').length
    if (!sub.withinLimit('resident', activeResidents)) return
    const unit = unitsRef.current.find(u => u.unitNumber === unitNumber)
    if (!unit || unit.occupancy !== 'Vacant') return
    const name = residentName.trim()
    const ph = phone.trim() || '—'
    const deposit = opts?.securityDeposit ?? 0
    const sb = getSupabase()
    let id = `r${Date.now()}`
    if (sb && sid !== BLANK_SOCIETY.id) {
      const { data } = await sb.from('residents').insert({
        society_id: sid, unit_id: unit.id, name, phone: ph, email: opts?.email ?? null,
        security_deposit: deposit, advance_rent: 0, account_status: 'Pending',
      }).select('id').single()
      if (data) id = data.id
      try { await sb.from('units').update({ status: 'Occupied' }).eq('id', unit.id) } catch { /* noop */ }
    }
    const nextUnits = unitsRef.current.map(u => u.unitNumber === unitNumber ? { ...u, occupancy: 'Occupied' as const, ownerName: name, phone: ph } : u)
    const nextRes = [...residentsRef.current, {
      id, name, unitNumber, phone: ph, email: opts?.email, outstandingBalance: 0,
      accountStatus: 'Pending' as const, securityDeposit: deposit, advanceRent: 0,
    }]
    setUnits(nextUnits); setResidents(nextRes)
    lsSave(K.units(sid), nextUnits); lsSave(K.residents(sid), nextRes)
    void writeAudit('RESIDENT_ASSIGNED', { unitNumber, residentName: name })

    // Move-in billing: charge the security deposit and (optionally) the first
    // month's rent as line-item invoices, so the unit's outstanding balance
    // equals exactly what the tenant still owes. The move-in payment is applied
    // across them (deposit first). The modal caps it so it can never overpay.
    const rent = unit.monthlyCharge
    const moveInLines: { period: string; amount: number }[] = []
    if (deposit > 0) moveInLines.push({ period: 'Security deposit', amount: deposit })
    if (opts?.billFirstMonth && rent > 0) {
      moveInLines.push({ period: new Date().toLocaleString('en', { month: 'long', year: 'numeric' }), amount: rent })
    }
    if (moveInLines.length > 0) {
      const dueDate = new Date().toISOString().slice(0, 10) // move-in charges are due on the day they move in
      let remainingPaid = Math.max(0, opts?.paidAtMoveIn ?? 0)
      const newInvoices: Invoice[] = []
      const newPayments: PaymentRecord[] = []
      for (const line of moveInLines) {
        const paidToLine = Math.min(remainingPaid, line.amount)
        remainingPaid -= paidToLine
        const outstanding = line.amount - paidToLine
        const status: Invoice['status'] = outstanding === 0 ? 'Paid' : paidToLine > 0 ? 'Partial' : 'Pending'
        let invId = `inv${Date.now()}-${newInvoices.length}`
        if (sb && sid !== BLANK_SOCIETY.id) {
          const { data } = await sb.from('invoices').insert({
            society_id: sid, unit_id: unit.id, resident_name: name, period: line.period, amount: line.amount, outstanding, status, due_date: dueDate,
          }).select('id').single()
          if (data) invId = data.id
        }
        newInvoices.push({ id: invId, unitNumber, residentName: name, amount: line.amount, outstanding, period: line.period, status, dueDate })
        if (paidToLine > 0) {
          const receiptId = await nextReceipt()
          newPayments.push({ id: `p${Date.now()}-${newPayments.length}`, receiptId, residentName: name, unitNumber, amount: paidToLine, date: fmtDate(new Date()), method: 'Cash', status: 'Confirmed', invoiceId: invId })
          if (sb && sid !== BLANK_SOCIETY.id) {
            try { await sb.from('payments').insert({ society_id: sid, invoice_id: invId, amount_paid: paidToLine, method: 'Cash', receipt_number: receiptId, paid_on: new Date().toISOString().slice(0, 10) }) } catch { /* noop */ }
          }
        }
      }
      const nextInv = [...newInvoices, ...invoicesRef.current]
      setInvoices(nextInv); lsSave(K.invoices(sid), nextInv)
      if (newPayments.length > 0) {
        const nextPay = [...newPayments, ...paymentsRef.current]
        setPayments(nextPay); lsSave(K.payments(sid), nextPay)
      }
      void writeAudit('MOVE_IN_BILLED', { unitNumber, deposit, rent: opts?.billFirstMonth ? rent : 0, paidAtMoveIn: opts?.paidAtMoveIn ?? 0 })
    }
  }, [sub, sid, nextReceipt, writeAudit])

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  const persistResident = useCallback(async (resId: string, db: Record<string, unknown>) => {
    const sb = getSupabase()
    if (!(sb && sid !== BLANK_SOCIETY.id && isUuid(resId))) return
    const { error } = await sb.from('residents').update(db).eq('id', resId)
    // Fallback for DBs where the optional `left_with_notice` column is not yet added.
    if (error && 'left_with_notice' in db) {
      const { left_with_notice: _omit, ...rest } = db
      try { await sb.from('residents').update(rest).eq('id', resId) } catch { /* noop */ }
    }
  }, [sid])

  const updateResident = useCallback(async (unitNumber: string, updates: { name?: string; phone?: string; email?: string; occupancy?: 'Occupied' | 'Vacant'; accountStatus?: Resident['accountStatus']; securityDeposit?: number; advanceRent?: number }) => {
    if (blocked()) return
    const target = residentForUnit(unitNumber, residentsRef.current)
    if (!target) return
    let nextRes = residentsRef.current.map(r => r.id === target.id ? {
      ...r,
      ...(updates.name ? { name: updates.name } : {}),
      ...(updates.phone ? { phone: updates.phone } : {}),
      ...(updates.email !== undefined ? { email: updates.email } : {}),
      ...(updates.accountStatus ? { accountStatus: updates.accountStatus } : {}),
      ...(updates.securityDeposit !== undefined ? { securityDeposit: updates.securityDeposit } : {}),
      ...(updates.advanceRent !== undefined ? { advanceRent: updates.advanceRent } : {}),
    } : r)
    if (updates.occupancy === 'Vacant') {
      nextRes = nextRes.map(r => r.id === target.id ? { ...r, accountStatus: 'Inactive' as const, movedOutAt: new Date().toISOString() } : r)
    }
    setResidents(nextRes); lsSave(K.residents(sid), nextRes)
    const nextUnits = unitsRef.current.map(u => u.unitNumber === unitNumber ? {
      ...u,
      ...(updates.occupancy ? { occupancy: updates.occupancy } : {}),
      ...(updates.name ? { ownerName: updates.name } : {}),
      ...(updates.phone ? { phone: updates.phone } : {}),
      ...(updates.occupancy === 'Vacant' ? { ownerName: undefined, phone: undefined } : {}),
    } : u)
    setUnits(nextUnits); lsSave(K.units(sid), nextUnits)
    const db: Record<string, unknown> = {}
    if (updates.name) db.name = updates.name
    if (updates.phone) db.phone = updates.phone
    if (updates.email !== undefined) db.email = updates.email || null
    if (updates.accountStatus) db.account_status = updates.accountStatus
    if (updates.securityDeposit !== undefined) db.security_deposit = updates.securityDeposit
    if (updates.advanceRent !== undefined) db.advance_rent = updates.advanceRent
    if (updates.occupancy === 'Vacant') { db.account_status = 'Inactive'; db.moved_out_at = new Date().toISOString() }
    if (Object.keys(db).length) await persistResident(target.id, db)
    const sb = getSupabase()
    if (updates.occupancy === 'Vacant' && sb && sid !== BLANK_SOCIETY.id) {
      const unit = unitsRef.current.find(u => u.unitNumber === unitNumber)
      if (unit) { try { await sb.from('units').update({ status: 'Vacant' }).eq('id', unit.id) } catch { /* noop */ } }
    }
  }, [sid, persistResident])

  const approveResident = useCallback(async (unitNumber: string) => {
    if (blocked()) return
    const target = residentForUnit(unitNumber, residentsRef.current)
    if (!target || target.accountStatus !== 'Pending') return
    const nextRes = residentsRef.current.map(r => r.id === target.id ? { ...r, accountStatus: 'Active' as const } : r)
    setResidents(nextRes); lsSave(K.residents(sid), nextRes)
    await persistResident(target.id, { account_status: 'Active' })
    void writeAudit('RESIDENT_APPROVED', { unit: unitNumber, resident: target.name })
  }, [sid, persistResident, writeAudit])

  const reactivateResident = useCallback(async (unitNumber: string) => {
    if (blocked()) return
    const unit = unitsRef.current.find(u => u.unitNumber === unitNumber)
    if (!unit || unit.occupancy === 'Occupied') return
    const res = residentsRef.current.find(r => r.unitNumber === unitNumber && r.accountStatus === 'Inactive')
    if (!res) return
    const nextRes = residentsRef.current.map(r => r.id === res.id ? { ...r, accountStatus: 'Active' as const, movedOutAt: undefined, leftWithNotice: undefined } : r)
    const nextUnits = unitsRef.current.map(u => u.unitNumber === unitNumber ? { ...u, occupancy: 'Occupied' as const, ownerName: res.name, phone: res.phone } : u)
    setResidents(nextRes); setUnits(nextUnits)
    lsSave(K.residents(sid), nextRes); lsSave(K.units(sid), nextUnits)
    await persistResident(res.id, { account_status: 'Active', moved_out_at: null, left_with_notice: null })
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) { try { await sb.from('units').update({ status: 'Occupied' }).eq('id', unit.id) } catch { /* noop */ } }
    void writeAudit('RESIDENT_REACTIVATED', { unit: unitNumber, resident: res.name })
  }, [sid, persistResident, writeAudit])

  const deleteResident = useCallback(async (residentId: string) => {
    if (blocked()) return
    const target = residentsRef.current.find(r => r.id === residentId)
    if (!target) return
    const nextRes = residentsRef.current.filter(r => r.id !== residentId)
    setResidents(nextRes); lsSave(K.residents(sid), nextRes)

    // Free the unit only if no other active resident record remains on it.
    const stillActive = nextRes.some(r => r.unitNumber === target.unitNumber && r.accountStatus !== 'Inactive')
    let nextUnits = unitsRef.current
    if (!stillActive) {
      nextUnits = unitsRef.current.map(u => u.unitNumber === target.unitNumber ? { ...u, occupancy: 'Vacant' as const, ownerName: undefined, phone: undefined } : u)
      setUnits(nextUnits); lsSave(K.units(sid), nextUnits)
    }

    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id && isUuid(residentId)) {
      try {
        await sb.from('residents').delete().eq('id', residentId)
        if (!stillActive) {
          const unit = nextUnits.find(u => u.unitNumber === target.unitNumber)
          if (unit && isUuid(unit.id)) await sb.from('units').update({ status: 'Vacant' }).eq('id', unit.id)
        }
      } catch { /* noop */ }
    }
    void writeAudit('RESIDENT_DELETED', { unit: target.unitNumber, resident: target.name })
  }, [sid, writeAudit])

  /* ── Billing ───────────────────────────────────────────── */
  const generateMonthlyInvoices = useCallback(async (period: string, _fallback: number, dueDateOverride?: string) => {
    if (blocked()) return
    const occupied = unitsRef.current.filter(u => u.occupancy === 'Occupied')
    const dueDate = dueDateOverride || new Date().toISOString().slice(0, 10)
    const alreadyBilled = new Set(invoicesRef.current.filter(i => i.period === period).map(i => i.unitNumber))
    const targets = occupied.filter(u => !alreadyBilled.has(u.unitNumber))
    if (!targets.length) return

    const sb = getSupabase()
    const created: Invoice[] = []
    for (const u of targets) {
      const amount = u.monthlyCharge || currentSociety.defaultFee || 0
      const resident = residentsRef.current.find(r => r.unitNumber === u.unitNumber && r.accountStatus !== 'Inactive')
      let id = `inv${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      if (sb && sid !== BLANK_SOCIETY.id) {
        const { data } = await sb.from('invoices').insert({
          society_id: sid, unit_id: u.id, resident_name: resident?.name ?? u.ownerName ?? '',
          period, amount, outstanding: amount, status: 'Pending', due_date: dueDate,
        }).select('id').single()
        if (data) id = data.id
      }
      created.push({ id, unitNumber: u.unitNumber, residentName: resident?.name ?? u.ownerName ?? '', amount, outstanding: amount, period, status: 'Pending', dueDate })
    }
    const next = [...created, ...invoicesRef.current]
    setInvoices(next); lsSave(K.invoices(sid), next)
    void writeAudit('INVOICES_GENERATED', { period, count: created.length, total: created.reduce((s, i) => s + i.amount, 0) })
  }, [currentSociety.defaultFee, sid, writeAudit])

  const recordPayment = useCallback(async (invoiceId: string, amount: number, method: string, dateOverride?: string, status: 'Pending' | 'Confirmed' = 'Confirmed') => {
    if (blocked()) return
    const inv = invoicesRef.current.find(i => i.id === invoiceId)
    if (!inv) return
    const receiptId = await nextReceipt()
    const resident = residentsRef.current.find(r => r.unitNumber === inv.unitNumber)
    const pending = status === 'Pending'
    // A pending payment is logged but does NOT touch the bill until it is confirmed.
    const newOutstanding = pending ? inv.outstanding : Math.max(0, inv.outstanding - amount)
    const newStatus: Invoice['status'] = pending ? inv.status : newOutstanding === 0 ? 'Paid' : newOutstanding < inv.amount ? 'Partial' : inv.status

    const nextInv = pending ? invoicesRef.current : invoicesRef.current.map(i => i.id === invoiceId ? { ...i, outstanding: newOutstanding, status: newStatus } : i)
    const payment: PaymentRecord = {
      id: `p${Date.now()}`, receiptId, residentName: inv.residentName || resident?.name || '',
      unitNumber: inv.unitNumber, amount, date: dateOverride ? fmtDate(new Date(dateOverride)) : fmtDate(new Date()), method, status, invoiceId,
    }
    const nextPay = [payment, ...paymentsRef.current]
    if (!pending) setInvoices(nextInv)
    setPayments(nextPay)
    lsSave(K.invoices(sid), nextInv); lsSave(K.payments(sid), nextPay)

    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      try {
        if (!pending) await sb.from('invoices').update({ outstanding: newOutstanding, status: newStatus }).eq('id', invoiceId)
        await sb.from('payments').insert({
          society_id: sid, invoice_id: invoiceId, amount_paid: amount, method, status, receipt_number: receiptId,
          paid_on: dateOverride || new Date().toISOString().slice(0, 10),
        })
      } catch { /* noop */ }
    }
    void writeAudit(pending ? 'PAYMENT_PENDING' : 'PAYMENT_RECORDED', { unit: inv.unitNumber, amount, method, receipt: receiptId })
  }, [nextReceipt, sid, writeAudit])

  const confirmPayment = useCallback(async (paymentId: string) => {
    if (blocked()) return
    const p = paymentsRef.current.find(x => x.id === paymentId)
    if (!p || p.status === 'Confirmed') return
    const inv = p.invoiceId ? invoicesRef.current.find(i => i.id === p.invoiceId) : undefined
    let nextInv = invoicesRef.current
    if (inv) {
      const out = Math.max(0, inv.outstanding - p.amount)
      const st: Invoice['status'] = out === 0 ? 'Paid' : out < inv.amount ? 'Partial' : inv.status
      nextInv = invoicesRef.current.map(i => i.id === inv.id ? { ...i, outstanding: out, status: st } : i)
      setInvoices(nextInv); lsSave(K.invoices(sid), nextInv)
    }
    const nextPay = paymentsRef.current.map(x => x.id === paymentId ? { ...x, status: 'Confirmed' as const } : x)
    setPayments(nextPay); lsSave(K.payments(sid), nextPay)
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      try {
        await sb.from('payments').update({ status: 'Confirmed' }).eq('id', paymentId)
        const upd = inv && nextInv.find(i => i.id === inv.id)
        if (upd) await sb.from('invoices').update({ outstanding: upd.outstanding, status: upd.status }).eq('id', upd.id)
      } catch { /* noop */ }
    }
    void writeAudit('PAYMENT_CONFIRMED', { receipt: p.receiptId, amount: p.amount })
  }, [sid, writeAudit])

  const deletePayment = useCallback(async (paymentId: string) => {
    if (blocked()) return
    const target = paymentsRef.current.find(p => p.id === paymentId)
    if (!target) return
    let nextInv = invoicesRef.current
    // Only a confirmed payment reduced a bill, so only its removal restores the balance.
    if (target.invoiceId && target.status !== 'Pending') {
      nextInv = invoicesRef.current.map(i => {
        if (i.id !== target.invoiceId) return i
        const out = Math.min(i.amount, i.outstanding + target.amount)
        return { ...i, outstanding: out, status: (out === 0 ? 'Paid' : out < i.amount ? 'Partial' : 'Pending') as Invoice['status'] }
      })
      setInvoices(nextInv); lsSave(K.invoices(sid), nextInv)
    }
    const nextPay = paymentsRef.current.filter(p => p.id !== paymentId)
    setPayments(nextPay); lsSave(K.payments(sid), nextPay)
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      try {
        await sb.from('payments').delete().eq('id', paymentId)
        const upd = nextInv.find(i => i.id === target.invoiceId)
        if (upd) await sb.from('invoices').update({ outstanding: upd.outstanding, status: upd.status }).eq('id', upd.id)
      } catch { /* noop */ }
    }
    void writeAudit('PAYMENT_DELETED', { receipt: target.receiptId, amount: target.amount })
  }, [sid, writeAudit])

  const checkoutResident = useCallback(async (unitNumber: string, opts: { noticeGiven: boolean; deductions: number }) => {
    if (blocked()) return
    const resident = residentForUnit(unitNumber, residentsRef.current)
    if (!resident || resident.accountStatus === 'Inactive') return
    const deposit = resident.securityDeposit ?? 0
    const advance = resident.advanceRent ?? 0
    const outstanding = outstandingForUnit(unitNumber, invoicesRef.current)
    // Advance rent is consumed by outstanding rent first (never refunded).
    const advanceApplied = Math.min(advance, outstanding)
    const remainingOutstanding = outstanding - advanceApplied
    // Security covers any rent the advance didn't; the remainder is refundable / forfeitable.
    const securityToRent = Math.min(deposit, remainingOutstanding)
    const appliedToRent = advanceApplied + securityToRent
    const securityRemaining = deposit - securityToRent
    // Gave notice → refund security minus verified damages. No notice → forfeit it all.
    const deductions = opts.noticeGiven
      ? Math.max(0, Math.min(opts.deductions || 0, securityRemaining))
      : securityRemaining
    const refund = opts.noticeGiven ? securityRemaining - deductions : 0

    if (appliedToRent > 0) {
      // Settle oldest unpaid bills first from the held funds; record it as one payment.
      let remaining = appliedToRent
      let firstId: string | undefined
      const ordered = invoicesRef.current
        .map((i, idx) => ({ i, idx }))
        .filter(x => x.i.unitNumber === unitNumber && x.i.outstanding > 0)
        .sort((a, b) => new Date(a.i.dueDate).getTime() - new Date(b.i.dueDate).getTime())
      const paidMap = new Map<string, { outstanding: number; status: Invoice['status'] }>()
      for (const { i } of ordered) {
        if (remaining <= 0) break
        const applied = Math.min(remaining, i.outstanding)
        remaining -= applied
        if (!firstId) firstId = i.id
        const out = i.outstanding - applied
        paidMap.set(i.id, { outstanding: out, status: out === 0 ? 'Paid' : 'Partial' })
      }
      const nextInv = invoicesRef.current.map(i => paidMap.has(i.id) ? { ...i, ...paidMap.get(i.id)! } : i)
      setInvoices(nextInv); lsSave(K.invoices(sid), nextInv)
      const receiptId = await nextReceipt()
      const pay: PaymentRecord = { id: `p${Date.now()}`, receiptId, residentName: resident.name, unitNumber, amount: appliedToRent, date: fmtDate(new Date()), method: 'Security Deposit', status: 'Confirmed', invoiceId: firstId }
      const nextPay = [pay, ...paymentsRef.current]
      setPayments(nextPay); lsSave(K.payments(sid), nextPay)
      const sb = getSupabase()
      if (sb && sid !== BLANK_SOCIETY.id && firstId) {
        try {
          for (const [id, v] of paidMap) await sb.from('invoices').update({ outstanding: v.outstanding, status: v.status }).eq('id', id)
          await sb.from('payments').insert({ society_id: sid, invoice_id: firstId, amount_paid: appliedToRent, method: 'Security Deposit', receipt_number: receiptId, paid_on: new Date().toISOString().slice(0, 10) })
        } catch { /* noop */ }
      }
    }

    const movedOutAt = new Date().toISOString()
    const nextRes = residentsRef.current.map(r => r.unitNumber === unitNumber && r.accountStatus !== 'Inactive' ? { ...r, accountStatus: 'Inactive' as const, movedOutAt, leftWithNotice: opts.noticeGiven } : r)
    const nextUnits = unitsRef.current.map(u => u.unitNumber === unitNumber ? { ...u, occupancy: 'Vacant' as const, ownerName: undefined, phone: undefined } : u)
    setResidents(nextRes); setUnits(nextUnits)
    lsSave(K.residents(sid), nextRes); lsSave(K.units(sid), nextUnits)
    await persistResident(resident.id, { account_status: 'Inactive', moved_out_at: movedOutAt, left_with_notice: opts.noticeGiven })
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      const unit = unitsRef.current.find(u => u.unitNumber === unitNumber)
      if (unit) { try { await sb.from('units').update({ status: 'Vacant' }).eq('id', unit.id) } catch { /* noop */ } }
    }
    void writeAudit('RESIDENT_MOVED_OUT', { unit: unitNumber, noticeGiven: opts.noticeGiven, deposit, advance, advanceApplied, securityToRent, deductions, refund })
  }, [sid, nextReceipt, persistResident, writeAudit])

  /* ── CRM: leads ─────────────────────────────────────────── */
  const persistLeads = useCallback((next: Lead[]) => {
    setLeads(next); lsSave(K.leads(sid), next)
  }, [sid])

  const addLead = useCallback(async (input: { name: string; phone?: string; email?: string; unitPref?: string; budget?: number; message?: string; unitId?: string }) => {
    if (blocked()) return
    const name = input.name.trim()
    if (!name) return
    const now = new Date().toISOString()
    const sb = getSupabase()
    let id = `lead${Date.now()}`
    const row = {
      society_id: sid, name, phone: (input.phone ?? '').trim(), email: input.email?.trim() || null,
      status: 'new' as const, source: 'manual' as const, unit_pref: (input.unitPref ?? '').trim(),
      message: (input.message ?? '').trim(), budget: input.budget ?? null, unit_id: input.unitId ?? null,
    }
    if (sb && sid !== BLANK_SOCIETY.id) {
      const { data } = await sb.from('leads').insert(row).select('id').single()
      if (data) id = data.id
    }
    persistLeads([{
      id, name, phone: row.phone, email: input.email?.trim() || undefined, status: 'new', source: 'manual',
      budget: input.budget, unitId: input.unitId, unitPref: row.unit_pref, message: row.message,
      notes: '', createdAt: now, updatedAt: now,
    }, ...leadsRef.current])
    void writeAudit('LEAD_CREATED', { name, source: 'manual' })
  }, [sid, persistLeads, writeAudit])

  const updateLead = useCallback(async (id: string, patch: Partial<Pick<Lead, 'name' | 'phone' | 'email' | 'status' | 'budget' | 'unitId' | 'unitPref' | 'notes' | 'assignedTo'>>) => {
    if (blocked()) return
    const target = leadsRef.current.find(l => l.id === id)
    if (!target) return
    const now = new Date().toISOString()
    persistLeads(leadsRef.current.map(l => l.id === id ? { ...l, ...patch, updatedAt: now } : l))
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id && isUuidStr(id)) {
      const db: Record<string, unknown> = { updated_at: now }
      if (patch.name !== undefined) db.name = patch.name
      if (patch.phone !== undefined) db.phone = patch.phone
      if (patch.email !== undefined) db.email = patch.email || null
      if (patch.status !== undefined) db.status = patch.status
      if (patch.budget !== undefined) db.budget = patch.budget ?? null
      if (patch.unitId !== undefined) db.unit_id = patch.unitId ?? null
      if (patch.unitPref !== undefined) db.unit_pref = patch.unitPref
      if (patch.notes !== undefined) db.notes = patch.notes
      if (patch.assignedTo !== undefined) db.assigned_to = patch.assignedTo ?? null
      try { await sb.from('leads').update(db).eq('id', id) } catch { /* noop */ }
    }
    if (patch.status) void writeAudit('LEAD_STATUS_CHANGED', { lead: target.name, status: patch.status })
  }, [sid, persistLeads, writeAudit])

  const deleteLead = useCallback(async (id: string) => {
    if (blocked()) return
    const target = leadsRef.current.find(l => l.id === id)
    if (!target) return
    persistLeads(leadsRef.current.filter(l => l.id !== id))
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id && isUuidStr(id)) { try { await sb.from('leads').delete().eq('id', id) } catch { /* noop */ } }
    void writeAudit('LEAD_DELETED', { lead: target.name })
  }, [sid, persistLeads, writeAudit])

  const assignLeadToMe = useCallback(async (id: string) => {
    if (!user) return
    await updateLead(id, { assignedTo: user.id })
  }, [user, updateLead])

  const convertLead = useCallback(async (id: string) => {
    const target = leadsRef.current.find(l => l.id === id)
    if (!target) return
    await updateLead(id, { status: 'won' })
    void writeAudit('LEAD_CONVERTED', { lead: target.name })
  }, [updateLead, writeAudit])

  /* ── CMS: public website ────────────────────────────────── */
  const saveSite = useCallback(async (content: SiteContent, published: boolean) => {
    if (blocked()) return
    const clean = normalizeSite(content)
    setSite(clean); setSitePublished(published)
    lsSave(K.site(sid), { content: clean, published } satisfies SiteCache)
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      try {
        await sb.from('society_sites').upsert(
          { society_id: sid, content: clean, published, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'society_id' },
        )
      } catch { /* noop */ }
    }
    void writeAudit(published ? 'SITE_PUBLISHED' : 'SITE_SAVED', { published })
  }, [sid, user, writeAudit])

  /* ── Reminders (derived from unpaid bills) ─────────────── */
  const overdueResidents = useMemo<OverdueResident[]>(() => {
    const today = Date.now()
    const map = new Map<string, OverdueResident>()
    for (const inv of invoices) {
      if (inv.outstanding <= 0 || inv.status === 'Paid') continue
      const resident = residents.find(r => r.unitNumber === inv.unitNumber && r.accountStatus !== 'Inactive')
      if (!resident) continue
      const due = new Date(inv.dueDate).getTime()
      const days = Number.isNaN(due) ? 0 : Math.max(0, Math.floor((today - due) / 86400000))
      const existing = map.get(inv.unitNumber)
      if (!existing) {
        map.set(inv.unitNumber, {
          id: `or-${inv.unitNumber}`, name: inv.residentName || resident.name, unitNumber: inv.unitNumber,
          phone: resident.phone, balance: inv.outstanding, daysOverdue: days,
          lastReminderDate: reminderLog[inv.unitNumber] ?? '', earliestDueDate: inv.dueDate,
        })
      } else {
        existing.balance += inv.outstanding
        existing.daysOverdue = Math.max(existing.daysOverdue, days)
        const prev = new Date(existing.earliestDueDate ?? Number.MAX_SAFE_INTEGER).getTime()
        if (!Number.isNaN(due) && due < prev) existing.earliestDueDate = inv.dueDate
      }
    }
    return [...map.values()]
  }, [invoices, residents, reminderLog])

  const sendReminder = useCallback(async (residentId: string) => {
    const target = overdueResidents.find(o => o.id === residentId)
    if (!target) return
    const now = fmtDate(new Date())
    setReminderLog(prev => { const upd = { ...prev, [target.unitNumber]: now }; lsSave(K.reminders(sid), upd); return upd })
    void writeAudit('REMINDER_SENT', { unit: target.unitNumber })
  }, [overdueResidents, sid, writeAudit])

  /* ── Society profile / plan requests ───────────────────── */
  const updateSociety = useCallback(async (updates: Partial<Pick<Society, 'name' | 'address' | 'defaultFee' | 'dueDay' | 'lateFeePct'>>) => {
    if (blocked()) return
    setCurrentSociety(prev => ({ ...prev, ...updates }))
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id) {
      const db: Record<string, unknown> = {}
      if (updates.name !== undefined) db.name = updates.name
      if (updates.address !== undefined) db.address = updates.address
      if (updates.defaultFee !== undefined) db.default_fee = updates.defaultFee
      if (updates.dueDay !== undefined) db.due_day = updates.dueDay
      if (updates.lateFeePct !== undefined) db.late_fee_pct = updates.lateFeePct
      if (Object.keys(db).length) { try { await sb.from('societies').update(db).eq('id', sid) } catch { /* noop */ } }
    }
    void writeAudit('SOCIETY_UPDATED', updates as Record<string, unknown>)
  }, [sid, writeAudit])

  const requestPlanChange = useCallback(async (kind: 'tier' | 'seats', detail: string) => {
    const sb = getSupabase()
    if (sb && sid !== BLANK_SOCIETY.id && user) {
      try { await sb.from('plan_change_requests').insert({ society_id: sid, requested_by: user.id, kind, detail }) } catch { /* noop */ }
    }
    void writeAudit('PLAN_CHANGE_REQUESTED', { kind, detail })
  }, [sid, user, writeAudit])

  const addSociety = useCallback(async (name: string, address: string) => {
    // Multi-property add for a T3 client — attaches the current user + a trial subscription.
    const sb = getSupabase()
    if (sb && user) {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)
      const { data: soc } = await sb.from('societies').insert({ name: name.trim(), slug, address: address.trim(), created_by: user.id }).select('id').single()
      if (soc) {
        await sb.from('society_members').insert({ society_id: soc.id, user_id: user.id, role: 'SOCIETY_ADMIN', access: 'owner' })
        await sb.from('subscriptions').insert({ society_id: soc.id, tier: sub.tier, status: 'active' })
        await refreshAuth()
        viewSociety(soc.id)
      }
      return
    }
    const demo: Society = { id: `s${Date.now()}`, name: name.trim(), address: address.trim(), tier: 'TIER_1', kind: 'society' }
    const list = [...lsLoad<Society[]>(K.demoSocieties, []), demo]
    lsSave(K.demoSocieties, list)
    setCurrentSociety(demo)
  }, [user, sub.tier, refreshAuth, viewSociety])

  const deleteSociety = useCallback(async (societyId: string) => {
    const sb = getSupabase()
    if (sb) { try { await sb.from('societies').delete().eq('id', societyId) } catch { /* noop */ }; await refreshAuth() }
    else {
      const list = lsLoad<Society[]>(K.demoSocieties, []).filter(s => s.id !== societyId)
      lsSave(K.demoSocieties, list)
      if (list[0]) { setCurrentSociety(list[0]); void loadSociety(list[0].id) }
    }
  }, [refreshAuth, loadSociety])

  /* ── Stats (derived) ───────────────────────────────────── */
  const stats: SocietyStats = useMemo(() => {
    const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0)
    const totalCollection = payments.filter(p => p.status !== 'Pending').reduce((s, p) => s + p.amount, 0)
    const totalOutstanding = invoices.reduce((s, i) => s + i.outstanding, 0)
    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollection / totalInvoiced) * 1000) / 10 : 0
    const unitCount = units.length
    const occupiedUnits = units.filter(u => u.occupancy === 'Occupied').length
    const disp = invoices.map(invoiceDisplayStatus)
    const totalInvoiceCount = invoices.length
    const paidInvoiceCount = disp.filter(d => d === 'Paid').length
    const partialInvoiceCount = disp.filter(d => d === 'Partially Paid').length
    const overdueInvoiceCount = disp.filter(d => d === 'Overdue').length
    const pct = (n: number) => totalInvoiceCount > 0 ? Math.round((n / totalInvoiceCount) * 1000) / 10 : 0
    return {
      totalInvoiced, totalCollection, totalOutstanding, collectionRate,
      overdueCount: overdueResidents.length, unitCount, occupiedUnits, vacantUnits: unitCount - occupiedUnits,
      activeResidents: residents.filter(r => r.accountStatus !== 'Inactive').length,
      paidCount: paidInvoiceCount, totalInvoiceCount, paidInvoiceCount, partialInvoiceCount, overdueInvoiceCount,
      paidPercent: pct(paidInvoiceCount), partialPercent: pct(partialInvoiceCount), overduePercent: pct(overdueInvoiceCount),
    }
  }, [invoices, payments, units, residents, overdueResidents])

  /* ── Permissions from the subscription ─────────────────── */
  const canSendAutomatedReminders = sub.hasFeature('whatsapp_reminders')
  const canBatchGenerate = sub.hasFeature('batch_billing')
  const canAccessAdvancedReports = sub.hasFeature('advanced_reports')
  const canAccessAuditLogs = sub.hasFeature('audit_logs')
  const canMultiSociety = sub.hasFeature('multi_society')
  const canAccessCrm = sub.hasFeature('crm_leads')
  const canAccessSite = sub.hasFeature('public_site')
  // Team management is a T2+ feature. The panel is shown to owners and editors;
  // the API still enforces that only the plan owner can actually add/remove people.
  const canManageTeam = sub.tier !== 'TIER_1' && myAccess !== 'viewer'
  const isReadOnly = sub.isReadOnly || myAccess === 'viewer'

  const setTier = useCallback(() => { /* tier is managed by the Super Admin — use requestPlanChange */ }, [])
  const setAdminName = useCallback(() => { /* profile edits go through auth-context */ }, [])

  const value = useMemo<SocietyContextValue>(() => ({
    units, residents, invoices, payments, overdueResidents, reminderLog, auditLogs,
    currentTier: sub.tier, adminName, societies, currentSociety, stats, loading,
    leads, site, sitePublished,
    setTier, setAdminName,
    recordPayment, confirmPayment, sendReminder, generateMonthlyInvoices, refreshData, switchSociety, addSociety,
    addUnit, updateUnit, updateSociety, requestPlanChange, assignResident, updateResident, approveResident,
    reactivateResident, deleteResident, deleteUnit, deletePayment, deleteSociety, checkoutResident,
    addLead, updateLead, deleteLead, assignLeadToMe, convertLead, saveSite,
    canSendAutomatedReminders, canBatchGenerate, canAccessAdvancedReports, canAccessAuditLogs, canMultiSociety, canManageTeam, myAccess,
    canAccessCrm, canAccessSite,
    isReadOnly,
    atPropertyLimit: !sub.withinLimit('property', units.length),
    atResidentLimit: !sub.withinLimit('resident', residents.filter(r => r.accountStatus !== 'Inactive').length),
  }), [units, residents, invoices, payments, overdueResidents, reminderLog, auditLogs, sub, adminName, societies, currentSociety, stats, loading,
      leads, site, sitePublished,
      setTier, setAdminName, recordPayment, confirmPayment, sendReminder, generateMonthlyInvoices, refreshData, switchSociety, addSociety,
      addUnit, updateUnit, updateSociety, requestPlanChange, assignResident, updateResident, approveResident, reactivateResident,
      deleteResident, deleteUnit, deletePayment, deleteSociety, checkoutResident,
      addLead, updateLead, deleteLead, assignLeadToMe, convertLead, saveSite,
      canSendAutomatedReminders, canBatchGenerate, canAccessAdvancedReports, canAccessAuditLogs, canMultiSociety, canManageTeam, myAccess,
      canAccessCrm, canAccessSite, isReadOnly])

  return <SocietyContext.Provider value={value}>{children}</SocietyContext.Provider>
}

export function useSociety(): SocietyContextValue {
  const ctx = useContext(SocietyContext)
  if (!ctx) throw new Error('useSociety must be used within a SocietyProvider')
  return ctx
}
