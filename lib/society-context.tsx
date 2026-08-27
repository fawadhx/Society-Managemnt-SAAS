'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from './supabase'

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
  outstandingBalance: number
  status: 'Paid' | 'Overdue' | 'Partial' | 'Pending' | 'Active'
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
}

export type OverdueResident = {
  id: string
  name: string
  unitNumber: string
  balance: number
  daysOverdue: number
  lastReminderDate: string
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
  tier?: SubscriptionTier
}

/* ── Subscription tiers ─────────────────────────────────── */

export type SubscriptionTier = 'TIER_1' | 'TIER_2' | 'TIER_3'

export const TIER_INFO: Record<SubscriptionTier, { label: string; name: string; price: number }> = {
  TIER_1: { label: 'T1', name: 'Basic', price: 1500 },
  TIER_2: { label: 'T2', name: 'Pro', price: 3000 },
  TIER_3: { label: 'T3', name: 'Enterprise', price: 5000 },
}

/* ── Actions ────────────────────────────────────────────── */

export type SocietyActions = {
  recordPayment: (invoiceId: string, amount: number, method: string, date?: string) => void
  sendReminder: (residentId: string) => void
  generateMonthlyInvoices: (period: string, defaultAmount: number, dueDate?: string) => void
  refreshData: () => Promise<void>
  switchSociety: (societyId: string) => void
  addSociety: (name: string, address: string) => void
  addUnit: (unitNumber: string, block: string, monthlyCharge?: number) => void
  updateUnit: (unitId: string, updates: { unitNumber?: string; block?: string; occupancy?: 'Occupied' | 'Vacant'; monthlyCharge?: number }) => void
  assignResident: (unitNumber: string, residentName: string, phone: string, opts?: { email?: string; securityDeposit?: number; advanceRent?: number }) => void
  updateResident: (unitNumber: string, updates: { name?: string; phone?: string; occupancy?: 'Occupied' | 'Vacant'; status?: Resident['status'] }) => void
  deleteUnit: (unitId: string) => Promise<void>
  deletePayment: (paymentId: string) => Promise<void>
  deleteSociety: (societyId: string) => Promise<void>
  checkoutResident: (unitNumber: string, action: 'refund' | 'forfeit') => void
}

/* ── Context shape ──────────────────────────────────────── */

export type SocietyStats = {
  totalCollection: number
  totalOutstanding: number
  totalInvoiced: number
  collectionRate: number
  overdueCount: number
  unitCount: number
  paidCount: number
  totalInvoiceCount: number
  paidInvoiceCount: number
  partialInvoiceCount: number
  overdueInvoiceCount: number
  paidPercent: number
  partialPercent: number
  overduePercent: number
}

export type SocietyState = {
  units: Unit[]
  residents: Resident[]
  invoices: Invoice[]
  payments: PaymentRecord[]
  overdueResidents: OverdueResident[]
  auditLogs: AuditLog[]
  currentTier: SubscriptionTier
  adminName: string
  societies: Society[]
  currentSociety: Society
  stats: SocietyStats
}

type Permissions = {
  canSendAutomatedReminders: boolean
  canBatchGenerate: boolean
  canAccessAdvancedReports: boolean
  canAccessAuditLogs: boolean
}

type SocietyContextValue = SocietyState & SocietyActions & Permissions & {
  setTier: (t: SubscriptionTier) => void
  setAdminName: (name: string) => void
  loading: boolean
  fetchSocietyData: (societyId: string) => Promise<void>
}

const SocietyContext = createContext<SocietyContextValue | null>(null)

/* ── Supabase helpers ───────────────────────────────────── */

const SB = isSupabaseConfigured()

function fmtDate(d: Date) {
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`
}

function fmtDateISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

/* ── LocalStorage persistence helpers ───────────────────── */

const LS_PREFIX = 'freebuff_society_'
const LS_KEYS = {
  societies: `${LS_PREFIX}societies`,
  currentSocietyId: `${LS_PREFIX}currentSocietyId`,
  adminName: `${LS_PREFIX}adminName`,
  units: (sid: string) => `${LS_PREFIX}units_${sid}`,
  residents: (sid: string) => `${LS_PREFIX}residents_${sid}`,
  invoices: (sid: string) => `${LS_PREFIX}invoices_${sid}`,
  payments: (sid: string) => `${LS_PREFIX}payments_${sid}`,
  auditLogs: (sid: string) => `${LS_PREFIX}auditLogs_${sid}`,
}

function lsLoad<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function lsSave(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage full or blocked — silently ignore.
  }
}

function lsSaveSocietyData(societyId: string, data: {
  units: Unit[]
  residents: Resident[]
  invoices: Invoice[]
  payments: PaymentRecord[]
  auditLogs: AuditLog[]
}) {
  lsSave(LS_KEYS.units(societyId), data.units)
  lsSave(LS_KEYS.residents(societyId), data.residents)
  lsSave(LS_KEYS.invoices(societyId), data.invoices)
  lsSave(LS_KEYS.payments(societyId), data.payments)
  lsSave(LS_KEYS.auditLogs(societyId), data.auditLogs)
}

/** Append a row to the audit_logs table (TIER_3 only). */
async function writeAudit(societyId: string, action: string, metadata: Record<string, unknown> = {}) {
  const sb = getSupabase()
  if (!sb) return
  try {
    await sb.from('audit_logs').insert({
      society_id: societyId,
      action,
      performed_by: 'app',
      metadata,
    })
  } catch {
    // Audit write is best-effort — never block the main action.
  }
}

/* SSR-safe: read LS on client, return fallback on server (avoids hydration mismatch) */
function lsOrFallback<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  return lsLoad(key, fallback)
}

/*
 * No hardcoded mock data. All initial state is derived from localStorage
 * (or Supabase). On a fresh install with no stored data, the app starts
 * with a single blank society and empty arrays.
 */

const BLANK_SOCIETY: Society = { id: '_blank', name: '', address: '', tier: 'TIER_1' }

/* ── Provider ───────────────────────────────────────────── */

let nextPaymentNum = 1000
let nextInvoiceNum = 1

export function SocietyProvider({ children }: { children: React.ReactNode }) {
  /*
   * Lazy initializers read localStorage synchronously during the first render
   * so state is populated from the very first paint (no flash of defaults).
   * An isMounted ref prevents the persist useEffect from overwriting localStorage
   * on that same initial render — writes only happen on subsequent state changes.
   */
  /* lsOrFallback reads LS on client, returns fallback on server — consistent, no flash. */
  const [societies, setSocieties] = useState<Society[]>(() =>
    lsOrFallback<Society[]>(LS_KEYS.societies, []))
  const [currentSociety, setCurrentSociety] = useState<Society>(() => {
    const savedSocieties = lsOrFallback<Society[]>(LS_KEYS.societies, [])
    if (savedSocieties.length === 0) return BLANK_SOCIETY
    const savedId = lsOrFallback<string>(LS_KEYS.currentSocietyId, savedSocieties[0].id)
    return savedSocieties.find(s => s.id === savedId) || savedSocieties[0]
  })
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>(() => {
    if (SB) return 'TIER_3'
    const savedSocieties = lsOrFallback<Society[]>(LS_KEYS.societies, [])
    if (savedSocieties.length === 0) return 'TIER_1'
    const savedId = lsOrFallback<string>(LS_KEYS.currentSocietyId, savedSocieties[0].id)
    const active = savedSocieties.find(s => s.id === savedId) || savedSocieties[0]
    return active?.tier ?? 'TIER_1'
  })
  const [units, setUnits] = useState<Unit[]>(() => lsOrFallback(LS_KEYS.units(currentSociety.id), []))
  const [residents, setResidents] = useState<Resident[]>(() => lsOrFallback(LS_KEYS.residents(currentSociety.id), []))
  const [invoices, setInvoices] = useState<Invoice[]>(() => lsOrFallback(LS_KEYS.invoices(currentSociety.id), []))
  const [payments, setPayments] = useState<PaymentRecord[]>(() => lsOrFallback(LS_KEYS.payments(currentSociety.id), []))
  const [overdueResidents, setOverdueResidents] = useState<OverdueResident[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => lsOrFallback(LS_KEYS.auditLogs(currentSociety.id), []))
  const [adminName, setAdminName] = useState(() => SB ? 'Arham Raza' : lsLoad<string>(LS_KEYS.adminName, 'Arham Raza'))
  const [loading, setLoading] = useState(SB)

  // Refs to access current state inside callbacks without re-triggering useMemo
  const unitsRef = useRef(units)
  const residentsRef = useRef(residents)
  const overdueRef = useRef(overdueResidents)
  const invoicesRef = useRef(invoices)
  const isMounted = useRef(false)
  unitsRef.current = units
  residentsRef.current = residents
  overdueRef.current = overdueResidents
  invoicesRef.current = invoices

  /* ── Mark as mounted after first render completes ────── */
  useEffect(() => {
    isMounted.current = true
  }, [])

  /* ── LocalStorage: persist state changes ──────────────── */
  useEffect(() => {
    if (!isMounted.current || SB) return // Skip initial render; Supabase handles its own persistence
    lsSave(LS_KEYS.societies, societies)
    lsSave(LS_KEYS.currentSocietyId, currentSociety.id)
    lsSave(LS_KEYS.adminName, adminName)
    lsSaveSocietyData(currentSociety.id, { units, residents, invoices, payments, auditLogs })
  }, [units, residents, invoices, payments, auditLogs, societies, currentSociety, currentTier, adminName])

  /* ── Supabase: fetch initial data ──────────────────────── */

  useEffect(() => {
    if (!SB) return

    const sb = getSupabase()
    if (!sb) return

    let cancelled = false

    async function fetchAll() {
      try {
        // 0. Fetch all societies for the switcher
        const { data: allSocieties } = await sb!.from('societies').select('*')
        if (cancelled) return
        const dbSocieties: Society[] = (allSocieties ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string, name: s.name as string, address: (s.address as string) ?? '',
          tier: (s.tier as SubscriptionTier) ?? 'TIER_1',
        }))
        if (dbSocieties.length > 0) {
          setSocieties(dbSocieties)
          setCurrentSociety(dbSocieties[0])
        }

        // 1. Fetch the first society row
        const { data: society } = await sb!.from('societies').select('*').limit(1).single()
        if (cancelled || !society) return
        const societyId = society.id
        setCurrentTier(society.tier as SubscriptionTier)

        // 2. Fetch units joined with owner info
        const { data: unitsData } = await sb!.from('units').select('*').eq('society_id', societyId)
        if (cancelled) return

        const dbUnits: Unit[] = (unitsData ?? []).map((u: Record<string, unknown>) => ({
          id: u.id as string,
          unitNumber: u.unit_number as string,
          type: 'Apartment',
          block: (u.unit_number as string).split('-')[0] ?? 'A',
          occupancy: (u.status as 'Occupied' | 'Vacant') ?? 'Vacant',
          monthlyCharge: society.default_fee as number,
        }))

        // Build a unit-id → unit map for joins
        const unitIdMap = new Map<string, { unitNumber: string; ownerName: string; phone: string }>()
        const societyUnitIds: string[] = []
        for (const u of unitsData ?? []) {
          unitIdMap.set(u.id as string, {
            unitNumber: u.unit_number as string,
            ownerName: u.owner_name as string,
            phone: u.phone as string,
          })
          societyUnitIds.push(u.id as string)
        }

        // 3. Fetch invoices (filtered to this society's units)
        const { data: invoicesData } = societyUnitIds.length > 0
          ? await sb!.from('invoices').select('*').in('unit_id', societyUnitIds).order('created_at', { ascending: false })
          : { data: [] as Record<string, unknown>[] }
        if (cancelled) return

        const dbInvoices: Invoice[] = (invoicesData ?? []).map((inv: Record<string, unknown>) => {
          const unit = unitIdMap.get(inv.unit_id as string)
          return {
            id: inv.id as string,
            unitNumber: unit?.unitNumber ?? '',
            residentName: unit?.ownerName ?? '',
            amount: inv.amount as number,
            outstanding: inv.outstanding as number,
            period: inv.period as string,
            status: inv.status as Invoice['status'],
            dueDate: inv.due_date as string,
          }
        })

        // 4. Fetch residents (derived from units + invoices)
        const dbResidents: Resident[] = dbUnits
          .filter(u => u.occupancy === 'Occupied')
          .map(u => {
            const inv = dbInvoices.find(i => i.unitNumber === u.unitNumber)
            return {
              id: `r-${u.unitNumber}`,
              name: unitIdMap.values().toArray().find(v => v.unitNumber === u.unitNumber)?.ownerName ?? '',
              unitNumber: u.unitNumber,
              phone: unitIdMap.values().toArray().find(v => v.unitNumber === u.unitNumber)?.phone ?? '',
              outstandingBalance: inv?.outstanding ?? 0,
              status: inv?.status === 'Paid' ? 'Paid' : inv?.status === 'Partial' ? 'Partial' : 'Overdue' as Resident['status'],
            }
          })

        // 5. Fetch payments (filtered to this society's invoices)
        const societyInvoiceIds = dbInvoices.map(i => i.id)
        const { data: paymentsData } = societyInvoiceIds.length > 0
          ? await sb!.from('payments').select('*').in('invoice_id', societyInvoiceIds).order('created_at', { ascending: false })
          : { data: [] as Record<string, unknown>[] }
        if (cancelled) return

        const dbPayments: PaymentRecord[] = (paymentsData ?? []).map((p: Record<string, unknown>, idx: number) => {
          // Find the invoice this payment belongs to
          const inv = dbInvoices.find(i => i.id === p.invoice_id)
          return {
            id: p.id as string,
            receiptId: (p.receipt_number as string) ?? `REC-${1000 + idx}`,
            residentName: inv?.residentName ?? '',
            unitNumber: inv?.unitNumber ?? '',
            amount: p.amount_paid as number,
            date: p.created_at as string,
            method: p.method as string,
          }
        })

        // 6. Derive overdue residents from invoices with outstanding > 0 and past due
        const now = new Date()
        const dbOverdue: OverdueResident[] = dbInvoices
          .filter(i => i.outstanding > 0 && i.status !== 'Paid')
          .map(inv => {
            const dueDate = new Date(inv.dueDate)
            const diffMs = now.getTime() - dueDate.getTime()
            const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
            return {
              id: `or-${inv.id}`,
              name: inv.residentName,
              unitNumber: inv.unitNumber,
              balance: inv.outstanding,
              daysOverdue,
              lastReminderDate: '',
            }
          })

        // 7. Fetch audit logs (TIER_3 only)
        let dbAuditLogs: AuditLog[] = []
        if (society.tier === 'TIER_3') {
          const { data: logsData } = await sb!.from('audit_logs').select('*').eq('society_id', societyId).order('timestamp', { ascending: false }).limit(100)
          dbAuditLogs = (logsData ?? []).map((l: Record<string, unknown>) => ({
            id: l.id as string,
            action: l.action as string,
            performedBy: l.performed_by as string,
            metadata: (typeof l.metadata === 'object' && l.metadata !== null ? l.metadata : {}) as Record<string, unknown>,
            timestamp: l.timestamp as string,
          }))
        }

        // Commit to state
        setUnits(dbUnits)
        setResidents(dbResidents)
        setInvoices(dbInvoices)
        setPayments(dbPayments)
        setOverdueResidents(dbOverdue)
        setAuditLogs(dbAuditLogs)
      } catch (err) {
        console.error('[SocietyProvider] Failed to fetch Supabase data:', err)
        // Fall back silently to the mock data already in state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  const setTier = useCallback((t: SubscriptionTier) => {
    setCurrentTier(t)
    // Update the tier on the society model itself (persisted via societies LS key)
    const updateSocieties = (prev: Society[]) => prev.map(s =>
      s.id === currentSociety.id ? { ...s, tier: t } : s)
    setSocieties(updateSocieties)
    setCurrentSociety(prev => ({ ...prev, tier: t }))
    // Persist the updated societies array to LS so tier survives refresh
    if (!SB) {
      const updated = updateSocieties(societies)
      lsSave(LS_KEYS.societies, updated)
    }
  }, [currentSociety.id, societies])

  /* ── fetchSocietyData: load all data for a given society ── */
  const fetchSocietyData = useCallback(async (societyId: string) => {
    const sb = getSupabase()
    if (!sb) return
    try {
      const { data: society } = await sb.from('societies').select('*').eq('id', societyId).single()
      if (!society) return
      setCurrentTier(society.tier as SubscriptionTier)

      const { data: unitsData } = await sb.from('units').select('*').eq('society_id', societyId)
      const dbUnits: Unit[] = (unitsData ?? []).map((u: Record<string, unknown>) => ({
        id: u.id as string, unitNumber: u.unit_number as string, type: 'Apartment',
        block: (u.unit_number as string).split('-')[0] ?? 'A',
        occupancy: (u.status as 'Occupied' | 'Vacant') ?? 'Vacant',
        monthlyCharge: society.default_fee as number,
      }))
      const unitIdMap = new Map<string, { unitNumber: string; ownerName: string; phone: string }>()
      const societyUnitIds: string[] = []
      for (const u of unitsData ?? []) {
        unitIdMap.set(u.id as string, { unitNumber: u.unit_number as string, ownerName: u.owner_name as string, phone: u.phone as string })
        societyUnitIds.push(u.id as string)
      }

      // Filter invoices to only those belonging to this society's units
      const { data: invoicesData } = societyUnitIds.length > 0
        ? await sb.from('invoices').select('*').in('unit_id', societyUnitIds).order('created_at', { ascending: false })
        : { data: [] as Record<string, unknown>[] }
      const dbInvoices: Invoice[] = (invoicesData ?? []).map((inv: Record<string, unknown>) => {
        const unit = unitIdMap.get(inv.unit_id as string)
        return { id: inv.id as string, unitNumber: unit?.unitNumber ?? '', residentName: unit?.ownerName ?? '', amount: inv.amount as number, outstanding: inv.outstanding as number, period: inv.period as string, status: inv.status as Invoice['status'], dueDate: inv.due_date as string }
      })

      const dbResidents: Resident[] = dbUnits.filter(u => u.occupancy === 'Occupied').map(u => {
        const inv = dbInvoices.find(i => i.unitNumber === u.unitNumber)
        const uInfo = [...unitIdMap.values()].find(v => v.unitNumber === u.unitNumber)
        return { id: `r-${u.unitNumber}`, name: uInfo?.ownerName ?? '', unitNumber: u.unitNumber, phone: uInfo?.phone ?? '', outstandingBalance: inv?.outstanding ?? 0, status: (inv?.status === 'Paid' ? 'Paid' : inv?.status === 'Partial' ? 'Partial' : 'Overdue') as Resident['status'] }
      })

      // Filter payments to only those belonging to this society's invoices
      const societyInvoiceIds = dbInvoices.map(i => i.id)
      const { data: paymentsData } = societyInvoiceIds.length > 0
        ? await sb.from('payments').select('*').in('invoice_id', societyInvoiceIds).order('created_at', { ascending: false })
        : { data: [] as Record<string, unknown>[] }
      const dbPayments: PaymentRecord[] = (paymentsData ?? []).map((p: Record<string, unknown>, idx: number) => {
        const inv = dbInvoices.find(i => i.id === p.invoice_id)
        return { id: p.id as string, receiptId: (p.receipt_number as string) ?? `REC-${1000 + idx}`, residentName: inv?.residentName ?? '', unitNumber: inv?.unitNumber ?? '', amount: p.amount_paid as number, date: p.created_at as string, method: p.method as string }
      })

      const now = new Date()
      const dbOverdue: OverdueResident[] = dbInvoices.filter(i => i.outstanding > 0 && i.status !== 'Paid').map(inv => {
        const dueDate = new Date(inv.dueDate)
        const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000))
        return { id: `or-${inv.id}`, name: inv.residentName, unitNumber: inv.unitNumber, balance: inv.outstanding, daysOverdue, lastReminderDate: '' }
      })

      let dbAuditLogs: AuditLog[] = []
      if (society.tier === 'TIER_3') {
        const { data: logsData } = await sb.from('audit_logs').select('*').eq('society_id', societyId).order('timestamp', { ascending: false }).limit(100)
        dbAuditLogs = (logsData ?? []).map((l: Record<string, unknown>) => ({ id: l.id as string, action: l.action as string, performedBy: l.performed_by as string, metadata: (typeof l.metadata === 'object' && l.metadata !== null ? l.metadata : {}) as Record<string, unknown>, timestamp: l.timestamp as string }))
      }

      setUnits(dbUnits)
      setResidents(dbResidents)
      setInvoices(dbInvoices)
      setPayments(dbPayments)
      setOverdueResidents(dbOverdue)
      setAuditLogs(dbAuditLogs)
    } catch (err) {
      console.error('[fetchSocietyData] Failed:', err)
    }
  }, [])

  /* ── refreshData: re-fetch everything from Supabase ── */
  const refreshData = useCallback(async () => {
    if (!SB) return
    try {
      const targetId = currentSociety.id
      await fetchSocietyData(targetId)
    } catch (err) {
      console.error('[refreshData] Failed:', err)
    }
  }, [currentSociety, fetchSocietyData])

  /* ── switchSociety: switch active society and reload ── */
  const switchSociety = useCallback(async (societyId: string) => {
    const target = societies.find(s => s.id === societyId)
    if (!target) return
    setCurrentSociety(target)

    // Immediately sync active society ID to localStorage so a refresh
    // will load the correct society on next mount.
    if (!SB) lsSave(LS_KEYS.currentSocietyId, societyId)

    // Apply the tier stored on the society model (no separate LS key needed)
    setCurrentTier(target.tier ?? 'TIER_1')

    if (SB) {
      await fetchSocietyData(societyId)
    } else {
      // Mock mode: load from localStorage if available, else clear
      const lsUnits = lsLoad<Unit[]>(LS_KEYS.units(societyId), [])
      const lsResidents = lsLoad<Resident[]>(LS_KEYS.residents(societyId), [])
      const lsInvoices = lsLoad<Invoice[]>(LS_KEYS.invoices(societyId), [])
      const lsPayments = lsLoad<PaymentRecord[]>(LS_KEYS.payments(societyId), [])
      const lsAuditLogs = lsLoad<AuditLog[]>(LS_KEYS.auditLogs(societyId), [])

      setUnits(lsUnits.length > 0 ? lsUnits : [])
      setResidents(lsResidents.length > 0 ? lsResidents : [])
      setInvoices(lsInvoices.length > 0 ? lsInvoices : [])
      setPayments(lsPayments.length > 0 ? lsPayments : [])
      setOverdueResidents([])
      setAuditLogs(lsAuditLogs.length > 0 ? lsAuditLogs : [])
    }
  }, [societies, fetchSocietyData])

  /* ── addSociety: create a new society locally (+ Supabase if configured) ── */
  const addSociety = useCallback(async (name: string, address: string) => {
    const newSociety: Society = { id: `s${Date.now()}`, name, address, tier: 'TIER_1' }
    setSocieties(prev => {
      const updated = [...prev, newSociety]
      if (!SB) lsSave(LS_KEYS.societies, updated)
      return updated
    })

    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb) return
        const { data } = await sb.from('societies').insert({ name, address, tier: 'TIER_1', default_fee: 12500 }).select('id').single()
        if (data) {
          const realSociety: Society = { id: data.id as string, name, address }
          setSocieties(prev => prev.map(s => s.id === newSociety.id ? realSociety : s))
        }
      } catch (err) {
        console.error('[addSociety] Supabase persist failed:', err)
      }
    }
  }, [])

  const canSendAutomatedReminders = currentTier !== 'TIER_1'
  const canBatchGenerate = currentTier !== 'TIER_1'
  const canAccessAdvancedReports = currentTier !== 'TIER_1'
  const canAccessAuditLogs = currentTier === 'TIER_3'

  /* ── addUnit: create a Vacant property (no owner) ──────── */
  const addUnit = useCallback((unitNumber: string, block: string, monthlyCharge?: number) => {
    const societyId = currentSociety.id
    const charge = monthlyCharge ?? 12500

    const newUnit: Unit = {
      id: `u${Date.now()}`,
      unitNumber,
      type: 'Apartment',
      block,
      occupancy: 'Vacant',
      monthlyCharge: charge,
      societyId,
    }

    const newUnits = [...unitsRef.current, newUnit]
    setUnits(newUnits)
    if (!SB) lsSave(LS_KEYS.units(currentSociety.id), newUnits)

    if (canAccessAuditLogs) {
      setAuditLogs(prev => [{
        id: `al${Date.now()}`,
        action: 'UNIT_CREATED',
        performedBy: 'admin',
        metadata: { unitNumber, block, monthlyCharge: charge },
        timestamp: new Date().toISOString(),
      }, ...prev])
    }

    if (SB) {
      (async () => {
        try {
          const sb = getSupabase()
          if (!sb) return
          const { data, error } = await sb.from('units').insert({
            society_id: societyId,
            unit_number: unitNumber,
            owner_name: null,
            phone: null,
            status: 'Vacant',
          }).select('id').single()
          if (error) throw error
          if (data) {
            setUnits(prev => prev.map(u => u.id === newUnit.id ? { ...u, id: data.id as string } : u))
          }
          if (canAccessAuditLogs) await writeAudit(societyId, 'UNIT_CREATED', { unitNumber, block })
        } catch (err) {
          console.error('[addUnit] Supabase persist failed:', err)
        }
      })()
    }
  }, [currentSociety, canAccessAuditLogs])

  /* ── updateUnit: edit property details ─────────────────── */
  const updateUnit = useCallback((unitId: string, updates: { unitNumber?: string; block?: string; occupancy?: 'Occupied' | 'Vacant'; monthlyCharge?: number }) => {
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, ...updates } : u))

    if (SB) {
      (async () => {
        try {
          const sb = getSupabase()
          if (!sb) return
          const dbUpdates: Record<string, unknown> = {}
          if (updates.unitNumber) dbUpdates.unit_number = updates.unitNumber
          if (updates.block) dbUpdates.unit_number = updates.unitNumber // Supabase uses unit_number
          if (updates.occupancy) dbUpdates.status = updates.occupancy
          // If marking Vacant, clear owner fields
          if (updates.occupancy === 'Vacant') {
            dbUpdates.owner_name = null
            dbUpdates.phone = null
          }
          if (Object.keys(dbUpdates).length > 0) {
            await sb.from('units').update(dbUpdates).eq('id', unitId)
          }
        } catch (err) {
          console.error('[updateUnit] Supabase persist failed:', err)
        }
      })()
    }
  }, [])

  /* ── assignResident: assign a resident to a Vacant unit ── */
  const assignResident = useCallback((unitNumber: string, residentName: string, phone: string, opts?: { email?: string; securityDeposit?: number; advanceRent?: number }) => {
    const displayName = residentName.trim()
    const displayPhone = phone.trim() || '—'
    const secDep = opts?.securityDeposit ?? 0
    const advRent = opts?.advanceRent ?? 0

    // Update unit to Occupied with owner info
    const updatedUnits: Unit[] = unitsRef.current.map(u => u.unitNumber === unitNumber ? { ...u, occupancy: 'Occupied' as const, ownerName: displayName, phone: displayPhone } : u)
    setUnits(updatedUnits)
    if (!SB) lsSave(LS_KEYS.units(currentSociety.id), updatedUnits)

    // Add resident record — defaults to Pending (no payment made yet)
    setResidents(prev => [...prev, {
      id: `r-${unitNumber}`,
      name: displayName,
      unitNumber,
      phone: displayPhone,
      outstandingBalance: secDep + advRent,
      status: 'Pending' as Resident['status'],
      securityDeposit: secDep,
      advanceRent: advRent,
    }])

    if (canAccessAuditLogs) {
      setAuditLogs(prev => [{
        id: `al${Date.now()}`,
        action: 'RESIDENT_ASSIGNED',
        performedBy: 'admin',
        metadata: { unitNumber, residentName: displayName, phone: displayPhone },
        timestamp: new Date().toISOString(),
      }, ...prev])
    }

    if (SB) {
      (async () => {
        try {
          const sb = getSupabase()
          if (!sb) return
          // Find the unit by unit_number and society_id
          const { data: unitRow } = await sb.from('units')
            .select('id')
            .eq('unit_number', unitNumber)
            .eq('society_id', currentSociety.id)
            .limit(1).single()
          if (unitRow) {
            await sb.from('units').update({
              owner_name: displayName,
              phone: displayPhone,
              status: 'Occupied',
            }).eq('id', unitRow.id)
          }
          if (canAccessAuditLogs) {
            await writeAudit(currentSociety.id, 'RESIDENT_ASSIGNED', { unitNumber, residentName: displayName })
          }
        } catch (err) {
          console.error('[assignResident] Supabase persist failed:', err)
        }
      })()
    }
  }, [currentSociety, canAccessAuditLogs])

  /* ── updateResident: edit resident details + occupancy ── */
  const updateResident = useCallback((unitNumber: string, updates: { name?: string; phone?: string; occupancy?: 'Occupied' | 'Vacant'; status?: Resident['status'] }) => {
    // Update the resident record
    setResidents(prev => prev.map(r => r.unitNumber === unitNumber ? {
      ...r,
      ...(updates.name ? { name: updates.name } : {}),
      ...(updates.phone ? { phone: updates.phone } : {}),
      ...(updates.status ? { status: updates.status } : {}),
    } : r))

    // Sync status to matching invoices so Residents and Billing tables agree
    if (updates.status) {
      setInvoices(prev => prev.map(i => {
        if (i.unitNumber !== unitNumber) return i
        return { ...i, status: updates.status as Invoice['status'] }
      }))
    }

    // If occupancy is changing to Vacant, clear the resident entirely
    if (updates.occupancy === 'Vacant') {
      setResidents(prev => prev.filter(r => r.unitNumber !== unitNumber))
    }

    // Also update the unit
    const updatedUnits: Unit[] = unitsRef.current.map(u => u.unitNumber === unitNumber ? {
      ...u,
      ...(updates.occupancy ? { occupancy: updates.occupancy } : {}),
      ...(updates.name ? { ownerName: updates.name } : {}),
      ...(updates.phone ? { phone: updates.phone } : {}),
      ...(updates.occupancy === 'Vacant' ? { ownerName: undefined, phone: undefined } : {}),
    } : u)
    setUnits(updatedUnits)
    if (!SB) lsSave(LS_KEYS.units(currentSociety.id), updatedUnits)

    if (SB) {
      (async () => {
        try {
          const sb = getSupabase()
          if (!sb) return
          const { data: unitRow } = await sb.from('units')
            .select('id').eq('unit_number', unitNumber).eq('society_id', currentSociety.id).limit(1).single()
          if (unitRow) {
            const dbUpdates: Record<string, unknown> = {}
            if (updates.name) dbUpdates.owner_name = updates.name
            if (updates.phone) dbUpdates.phone = updates.phone
            if (updates.occupancy) dbUpdates.status = updates.occupancy
            if (updates.occupancy === 'Vacant') { dbUpdates.owner_name = null; dbUpdates.phone = null }
            if (Object.keys(dbUpdates).length > 0) await sb.from('units').update(dbUpdates).eq('id', unitRow.id)
          }
        } catch (err) {
          console.error('[updateResident] Supabase persist failed:', err)
        }
      })()
    }
  }, [currentSociety])

  /* ── checkoutResident: terminate lease with refund or forfeit ── */
  const checkoutResident = useCallback((unitNumber: string, action: 'refund' | 'forfeit') => {
    const resident = residents.find(r => r.unitNumber === unitNumber)
    if (!resident) return

    const deposit = resident.securityDeposit ?? 0
    const outstanding = resident.outstandingBalance

    if (action === 'forfeit') {
      // Forfeit deposit: apply toward outstanding rent or retain as settlement
      const settlementAmount = Math.min(deposit, outstanding)
      const retainedAmount = deposit - settlementAmount

      // If deposit covers partial outstanding, reduce it
      if (settlementAmount > 0) {
        setInvoices(prev => prev.map(i => {
          if (i.unitNumber !== unitNumber || i.status === 'Paid') return i
          const newOutstanding = Math.max(0, i.outstanding - settlementAmount)
          return { ...i, outstanding: newOutstanding, status: newOutstanding === 0 ? 'Paid' : 'Partial' as Invoice['status'] }
        }))
        setResidents(prev => prev.map(r => {
          if (r.unitNumber !== unitNumber) return r
          return { ...r, outstandingBalance: Math.max(0, r.outstandingBalance - settlementAmount) }
        }))
      }

      // Audit settlement entry
      setAuditLogs(prev => [{
        id: `al${Date.now()}`,
        action: 'DEPOSIT_FORFEITED',
        performedBy: 'admin',
        metadata: { unitNumber, residentName: resident.name, deposit, settlementAmount, retainedAmount, reason: retainedAmount > 0 ? 'Retained for damages/notice' : 'Applied to outstanding rent' },
        timestamp: new Date().toISOString(),
      }, ...prev])
    }
    // action === 'refund': deposit is returned (no financial adjustment needed)

    // Remove overdue entry
    setOverdueResidents(prev => prev.filter(o => o.unitNumber !== unitNumber))

    // Remove resident record
    setResidents(prev => prev.filter(r => r.unitNumber !== unitNumber))

    // Set unit to Vacant
    setUnits(prev => prev.map(u => u.unitNumber === unitNumber ? { ...u, occupancy: 'Vacant', ownerName: undefined, phone: undefined } : u))

    // Audit log
    setAuditLogs(prev => [{
      id: `al${Date.now() + 1}`,
      action: 'RESIDENT_CHECKED_OUT',
      performedBy: 'admin',
      metadata: { unitNumber, residentName: resident.name, action, depositRefunded: action === 'refund' ? deposit : 0, depositForfeited: action === 'forfeit' ? deposit : 0 },
      timestamp: new Date().toISOString(),
    }, ...prev])

    // Supabase persist
    if (SB) {
      (async () => {
        try {
          const sb = getSupabase()
          if (!sb) return
          const { data: unitRow } = await sb.from('units').select('id').eq('unit_number', unitNumber).eq('society_id', currentSociety.id).limit(1).single()
          if (unitRow) {
            await sb.from('units').update({ status: 'Vacant', owner_name: null, phone: null }).eq('id', unitRow.id)
          }
          if (canAccessAuditLogs) {
            await writeAudit(currentSociety.id, 'RESIDENT_CHECKED_OUT', { unitNumber, action, deposit })
          }
        } catch (err) {
          console.error('[checkoutResident] Supabase persist failed:', err)
        }
      })()
    }
  }, [residents, currentSociety, canAccessAuditLogs])

  /* ── Computed stats (derived from current data) ── */
  const stats: SocietyStats = useMemo(() => {
    const totalInvoiced = invoices.reduce((sum, i) => sum + i.amount, 0)
    const totalCollection = payments.reduce((sum, p) => sum + p.amount, 0)
    const totalOutstanding = invoices.reduce((sum, i) => sum + i.outstanding, 0)
    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollection / totalInvoiced) * 1000) / 10 : 0
    const overdueCount = overdueResidents.length
    const unitCount = units.length
    const totalInvoiceCount = invoices.length
    const paidInvoiceCount = invoices.filter(i => i.status === 'Paid').length
    const partialInvoiceCount = invoices.filter(i => i.status === 'Partial').length
    const overdueInvoiceCount = invoices.filter(i => i.status === 'Overdue').length
    const paidPercent = totalInvoiceCount > 0 ? Math.round((paidInvoiceCount / totalInvoiceCount) * 1000) / 10 : 0
    const partialPercent = totalInvoiceCount > 0 ? Math.round((partialInvoiceCount / totalInvoiceCount) * 1000) / 10 : 0
    const overduePercent = totalInvoiceCount > 0 ? Math.round((overdueInvoiceCount / totalInvoiceCount) * 1000) / 10 : 0
    const paidCount = paidInvoiceCount
    return { totalCollection, totalOutstanding, totalInvoiced, collectionRate, overdueCount, unitCount, paidCount, totalInvoiceCount, paidInvoiceCount, partialInvoiceCount, overdueInvoiceCount, paidPercent, partialPercent, overduePercent }
  }, [invoices, payments, overdueResidents, units])

  /* ── deleteSociety: remove a society and all its data ── */
  const deleteSociety = useCallback(async (societyId: string) => {
    const target = societies.find(s => s.id === societyId)
    if (!target) return
    // Prevent deleting the last society
    if (societies.length <= 1) return

    // Local state: remove society and switch to first remaining
    const remaining = societies.filter(s => s.id !== societyId)
    setSocieties(remaining)
    if (!SB) lsSave(LS_KEYS.societies, remaining)

    // If deleting the active society, switch to the first remaining
    if (currentSociety.id === societyId) {
      const fallback = remaining[0]
      setCurrentSociety(fallback)
      // Load fallback's tier and data
      if (!SB) {
        lsSave(LS_KEYS.currentSocietyId, fallback.id)
        setCurrentTier(fallback.tier ?? 'TIER_1')
      }
      // Clear data since we're switching away
      setUnits([])
      setResidents([])
      setInvoices([])
      setPayments([])
      setOverdueResidents([])
      setAuditLogs([])
    }
    // Clean up localStorage for the deleted society
    if (!SB) {
      try {
        localStorage.removeItem(LS_KEYS.units(societyId))
        localStorage.removeItem(LS_KEYS.residents(societyId))
        localStorage.removeItem(LS_KEYS.invoices(societyId))
        localStorage.removeItem(LS_KEYS.payments(societyId))
        localStorage.removeItem(LS_KEYS.auditLogs(societyId))
      } catch { /* best-effort cleanup */ }
    }

    // Supabase persist
    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb) return
        await sb.from('societies').delete().eq('id', societyId)
      } catch (err) {
        console.error('[deleteSociety] Supabase delete failed:', err)
      }
    }
  }, [societies, currentSociety])

  /* ── deleteUnit: remove a unit (+ related invoices/payments) ── */
  const deleteUnit = useCallback(async (unitId: string) => {
    const targetUnit = units.find(u => u.id === unitId)
    if (!targetUnit) return
    const label = `${targetUnit.unitNumber} (${targetUnit.type})`

    // Local state update
    setUnits(prev => prev.filter(u => u.id !== unitId))
    setInvoices(prev => prev.filter(i => {
      // Remove invoices whose unitNumber matches
      return i.unitNumber !== targetUnit.unitNumber
    }))
    setPayments(prev => prev.filter(p => p.unitNumber !== targetUnit.unitNumber))
    setResidents(prev => prev.filter(r => r.unitNumber !== targetUnit.unitNumber))
    setOverdueResidents(prev => prev.filter(r => r.unitNumber !== targetUnit.unitNumber))

    // Audit log (TIER_3 only)
    if (canAccessAuditLogs) {
      setAuditLogs(prev => [{
        id: `al${Date.now()}`,
        action: 'UNIT_DELETED',
        performedBy: 'admin',
        metadata: { unitId, unitNumber: targetUnit.unitNumber, type: targetUnit.type },
        timestamp: new Date().toISOString(),
      }, ...prev])
    }

    // Supabase persist
    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb) return
        await sb.from('units').delete().eq('id', unitId)
      } catch (err) {
        console.error('[deleteUnit] Supabase delete failed:', err)
      }
    }
  }, [units, canAccessAuditLogs])

  /* ── deletePayment: remove a payment record ── */
  const deletePayment = useCallback(async (paymentId: string) => {
    const targetPayment = payments.find(p => p.id === paymentId)
    if (!targetPayment) return

    // Local state update
    setPayments(prev => prev.filter(p => p.id !== paymentId))

    // Audit log (TIER_3 only)
    if (canAccessAuditLogs) {
      setAuditLogs(prev => [{
        id: `al${Date.now()}`,
        action: 'PAYMENT_DELETED',
        performedBy: 'admin',
        metadata: { paymentId, receiptId: targetPayment.receiptId, unit: targetPayment.unitNumber, amount: targetPayment.amount },
        timestamp: new Date().toISOString(),
      }, ...prev])
    }

    // Supabase persist
    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb) return
        await sb.from('payments').delete().eq('id', paymentId)
      } catch (err) {
        console.error('[deletePayment] Supabase delete failed:', err)
      }
    }
  }, [payments, canAccessAuditLogs])

  /* ── recordPayment ─────────────────────────────────────── */

  const recordPayment = useCallback(async (invoiceId: string, amount: number, method: string, dateOverride?: string) => {
    // --- Local state update (always, serves as optimistic update) ---
    const inv = invoices.find(i => i.id === invoiceId)

    setInvoices(prev => prev.map(i => {
      if (i.id !== invoiceId) return i
      const newOutstanding = Math.max(0, i.outstanding - amount)
      const newStatus = newOutstanding === 0 ? 'Paid' : newOutstanding < i.amount ? 'Partial' : i.status
      return { ...i, outstanding: newOutstanding, status: newStatus as Invoice['status'] }
    }))

    setResidents(prev => prev.map(res => {
      if (!inv || res.unitNumber !== inv.unitNumber) return res
      const newBalance = Math.max(0, res.outstandingBalance - amount)
      const newStatus = newBalance === 0 ? 'Paid' : 'Partial' as Resident['status']
      return { ...res, outstandingBalance: newBalance, status: newStatus }
    }))

    setOverdueResidents(prev => {
      if (!inv) return prev
      const newBalance = Math.max(0, inv.outstanding - amount)
      if (newBalance <= 0) return prev.filter(o => o.unitNumber !== inv.unitNumber)
      return prev.map(o => o.unitNumber === inv.unitNumber ? { ...o, balance: newBalance } : o)
    })

    setPayments(prev => {
      const resident = residentsRef.current.find(r => inv && r.unitNumber === inv.unitNumber)
      const receiptId = `REC-${nextPaymentNum++}`
      const newPayment: PaymentRecord = {
        id: `p${prev.length + 1}`,
        receiptId,
        residentName: resident?.name ?? inv?.residentName ?? '',
        unitNumber: inv?.unitNumber ?? '',
        amount,
        date: dateOverride || fmtDate(new Date()),
        method,
      }
      return [newPayment, ...prev]
    })

    // --- Supabase persist (async, fire-and-forget) ---
    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb || !inv) return

        // Find the DB unit_id for this invoice's unit
        const { data: unitRow } = await sb
          .from('units')
          .select('id')
          .eq('unit_number', inv.unitNumber)
          .limit(1)
          .single()
        if (!unitRow) return

        // Find the DB invoice
        const { data: dbInvoice } = await sb
          .from('invoices')
          .select('*')
          .eq('unit_id', unitRow.id)
          .eq('period', inv.period)
          .limit(1)
          .single()
        if (!dbInvoice) return

        const newOutstanding = Math.max(0, (dbInvoice.outstanding as number) - amount)
        const newStatus = newOutstanding === 0 ? 'Paid' : newOutstanding < (dbInvoice.amount as number) ? 'Partial' : dbInvoice.status

        // Update the invoice
        await sb.from('invoices').update({ outstanding: newOutstanding, status: newStatus }).eq('id', dbInvoice.id)

        // Insert the payment
        await sb.from('payments').insert({
          invoice_id: dbInvoice.id,
          amount_paid: amount,
          method,
          receipt_number: `REC-${nextPaymentNum - 1}`,
        })

        // Update the unit owner's balance
        if (unitRow) {
          await sb.from('units').update({ owner_name: inv.residentName }).eq('id', unitRow.id)
        }

        // Audit log for TIER_3
        if (canAccessAuditLogs) {
          const { data: society } = await sb.from('societies').select('id').limit(1).single()
          if (society) {
            await writeAudit(society.id, 'PAYMENT_RECORDED', {
              invoice_id: dbInvoice.id,
              amount,
              method,
              unit_number: inv.unitNumber,
            })
          }
        }
      } catch (err) {
        console.error('[recordPayment] Supabase persist failed:', err)
      }
    }
  }, [invoices, canAccessAuditLogs])

  /* ── sendReminder ──────────────────────────────────────── */

  const sendReminder = useCallback(async (residentId: string) => {
    const now = fmtDate(new Date())
    setOverdueResidents(prev =>
      prev.map(o => o.id === residentId ? { ...o, lastReminderDate: now } : o)
    )

    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb) return

        const { data: society } = await sb.from('societies').select('id').limit(1).single()
        if (!society) return

        // Find the overdue resident to get the unit number for the audit log
        const overdue = overdueRef.current.find(o => o.id === residentId)

        if (canAccessAuditLogs) {
          await writeAudit(society.id, 'REMINDER_SENT', {
            resident_id: residentId,
            unit_number: overdue?.unitNumber ?? '',
          })
        }
      } catch (err) {
        console.error('[sendReminder] Supabase persist failed:', err)
      }
    }
  }, [canAccessAuditLogs])

  /* ── generateMonthlyInvoices ───────────────────────────── */

  const generateMonthlyInvoices = useCallback(async (period: string, defaultAmount: number, dueDateOverride?: string) => {
    const activeUnits = unitsRef.current.filter(u => u.occupancy === 'Occupied')
    const currentResidents = residentsRef.current
    const currentOverdue = overdueRef.current
    const dueDate = dueDateOverride || `10 ${period}`

    // --- Local state update ---
    // Calculate arrears: sum of unpaid balance from previous invoices per unit
    const currentInvoices = invoicesRef.current
    const arrearsMap = new Map<string, number>()
    for (const inv of currentInvoices) {
      if (inv.outstanding > 0 && inv.status !== 'Paid') {
        arrearsMap.set(inv.unitNumber, (arrearsMap.get(inv.unitNumber) ?? 0) + inv.outstanding)
      }
    }

    const newInvoices: Invoice[] = activeUnits.map(u => {
      const resident = currentResidents.find(r => r.unitNumber === u.unitNumber)
      const arrears = arrearsMap.get(u.unitNumber) ?? 0
      const totalDue = defaultAmount + arrears
      return {
        id: `inv${nextInvoiceNum++}`,
        unitNumber: u.unitNumber,
        residentName: resident?.name ?? '',
        amount: totalDue,
        outstanding: totalDue,
        period,
        status: 'Pending' as const,
        dueDate,
      }
    })

    setInvoices(prev => [...newInvoices, ...prev])

    const newOverdue: OverdueResident[] = activeUnits
      .filter(u => !currentOverdue.some(o => o.unitNumber === u.unitNumber))
      .map(u => {
        const resident = currentResidents.find(r => r.unitNumber === u.unitNumber)
        return {
          id: `or${currentOverdue.length + newOverdue.length + 1}`,
          name: resident?.name ?? '',
          unitNumber: u.unitNumber,
          balance: defaultAmount,
          daysOverdue: 0,
          lastReminderDate: '',
        }
      })

    if (newOverdue.length > 0) {
      setOverdueResidents(prev => [...prev, ...newOverdue])
    }

    // --- Supabase persist ---
    if (SB) {
      try {
        const sb = getSupabase()
        if (!sb) return

        const { data: society } = await sb.from('societies').select('id').limit(1).single()
        if (!society) return

        const societyId = society.id

        // Fetch current units from DB
        const { data: dbUnits } = await sb.from('units').select('id, unit_number').eq('society_id', societyId)
        if (!dbUnits) return

        const invoiceInserts = dbUnits
          .filter((u: Record<string, unknown>) => {
            // Only occupied units (check if they have an existing active invoice)
            const unitNumber = u.unit_number as string
            return activeUnits.some(au => au.unitNumber === unitNumber)
          })
          .map((u: Record<string, unknown>) => ({
            unit_id: u.id as string,
            period,
            amount: defaultAmount,
            outstanding: defaultAmount,
            status: 'Pending',
            due_date: dueDate,
          }))

        if (invoiceInserts.length > 0) {
          await sb.from('invoices').insert(invoiceInserts)
        }

        // Audit log
        if (canAccessAuditLogs) {
          await writeAudit(societyId, 'INVOICES_GENERATED', {
            period,
            unit_count: invoiceInserts.length,
            total_amount: invoiceInserts.length * defaultAmount,
          })
        }
      } catch (err) {
        console.error('[generateMonthlyInvoices] Supabase persist failed:', err)
      }
    }
  }, [canAccessAuditLogs])

  /* ── Memoised value ────────────────────────────────────── */

  const value = useMemo<SocietyContextValue>(
    () => ({
      units, residents, invoices, payments, overdueResidents, auditLogs, currentTier, adminName, societies, currentSociety, stats, loading, setTier, setAdminName,
      recordPayment, sendReminder, generateMonthlyInvoices, refreshData, switchSociety, addSociety, addUnit, updateUnit, assignResident, updateResident, fetchSocietyData, deleteUnit, deletePayment, deleteSociety, checkoutResident,
      canSendAutomatedReminders, canBatchGenerate, canAccessAdvancedReports, canAccessAuditLogs,
    }),
    [units, residents, invoices, payments, overdueResidents, auditLogs, currentTier, adminName, societies, currentSociety, stats, loading, setTier, setAdminName,
     recordPayment, sendReminder, generateMonthlyInvoices, refreshData, switchSociety, addSociety, addUnit, updateUnit, assignResident, updateResident, fetchSocietyData, deleteUnit, deletePayment, deleteSociety, checkoutResident,
     canSendAutomatedReminders, canBatchGenerate, canAccessAdvancedReports, canAccessAuditLogs],
  )

  return <SocietyContext.Provider value={value}>{children}</SocietyContext.Provider>
}

/* ── Hook ───────────────────────────────────────────────── */

export function useSociety(): SocietyContextValue {
  const ctx = useContext(SocietyContext)
  if (!ctx) throw new Error('useSociety must be used within a SocietyProvider')
  return ctx
}
