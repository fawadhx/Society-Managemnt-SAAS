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
}

export type Resident = {
  id: string
  name: string
  unitNumber: string
  phone: string
  outstandingBalance: number
  status: 'Paid' | 'Overdue' | 'Partial' | 'Active'
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
  recordPayment: (invoiceId: string, amount: number, method: string) => void
  sendReminder: (residentId: string) => void
  generateMonthlyInvoices: (period: string, defaultAmount: number) => void
  refreshData: () => Promise<void>
  switchSociety: (societyId: string) => void
  addSociety: (name: string, address: string) => void
  deleteUnit: (unitId: string) => Promise<void>
  deletePayment: (paymentId: string) => Promise<void>
  deleteSociety: (societyId: string) => Promise<void>
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

/* ── Initial mock data (used when Supabase is not configured) */

const today = new Date()

const initialUnits: Unit[] = [
  { id: 'u1', unitNumber: 'A-101', type: 'Apartment', block: 'A', occupancy: 'Occupied', monthlyCharge: 12500 },
  { id: 'u2', unitNumber: 'A-102', type: 'Apartment', block: 'A', occupancy: 'Occupied', monthlyCharge: 12500 },
  { id: 'u3', unitNumber: 'A-103', type: 'Apartment', block: 'A', occupancy: 'Occupied', monthlyCharge: 12500 },
  { id: 'u4', unitNumber: 'B-204', type: 'Apartment', block: 'B', occupancy: 'Occupied', monthlyCharge: 12500 },
  { id: 'u5', unitNumber: 'B-205', type: 'Apartment', block: 'B', occupancy: 'Occupied', monthlyCharge: 12500 },
  { id: 'u6', unitNumber: 'C-301', type: 'Apartment', block: 'C', occupancy: 'Vacant', monthlyCharge: 12500 },
  { id: 'u7', unitNumber: 'C-304', type: 'Apartment', block: 'C', occupancy: 'Occupied', monthlyCharge: 12500 },
]

const initialResidents: Resident[] = [
  { id: 'r1', name: 'Ahmed Raza', unitNumber: 'A-101', phone: '0300 1234567', outstandingBalance: 0, status: 'Paid' },
  { id: 'r2', name: 'Fatima Khan', unitNumber: 'A-102', phone: '0312 5550142', outstandingBalance: 12500, status: 'Overdue' },
  { id: 'r3', name: 'Usman Tariq', unitNumber: 'A-103', phone: '0333 8211004', outstandingBalance: 0, status: 'Paid' },
  { id: 'r4', name: 'Sana Iqbal', unitNumber: 'B-204', phone: '0301 4412233', outstandingBalance: 4500, status: 'Partial' },
  { id: 'r5', name: 'Hassan Ali', unitNumber: 'B-205', phone: '0321 7789001', outstandingBalance: 8000, status: 'Overdue' },
  { id: 'r6', name: 'Bilal Shah', unitNumber: 'C-301', phone: '0300 5551234', outstandingBalance: 0, status: 'Paid' },
  { id: 'r7', name: 'Mariam Noor', unitNumber: 'C-304', phone: '0311 9990876', outstandingBalance: 4500, status: 'Overdue' },
]

const initialInvoices: Invoice[] = [
  { id: 'inv1', unitNumber: 'A-101', residentName: 'Ahmed Raza', amount: 12500, outstanding: 0, period: 'Aug 2026', status: 'Paid', dueDate: '10 Aug 2026' },
  { id: 'inv2', unitNumber: 'A-102', residentName: 'Fatima Khan', amount: 12500, outstanding: 12500, period: 'Aug 2026', status: 'Overdue', dueDate: '10 Aug 2026' },
  { id: 'inv3', unitNumber: 'A-103', residentName: 'Usman Tariq', amount: 12500, outstanding: 0, period: 'Aug 2026', status: 'Paid', dueDate: '10 Aug 2026' },
  { id: 'inv4', unitNumber: 'B-204', residentName: 'Sana Iqbal', amount: 12500, outstanding: 4500, period: 'Aug 2026', status: 'Partial', dueDate: '10 Aug 2026' },
  { id: 'inv5', unitNumber: 'B-205', residentName: 'Hassan Ali', amount: 12500, outstanding: 8000, period: 'Aug 2026', status: 'Overdue', dueDate: '10 Aug 2026' },
  { id: 'inv6', unitNumber: 'C-301', residentName: 'Bilal Shah', amount: 12500, outstanding: 0, period: 'Aug 2026', status: 'Paid', dueDate: '10 Aug 2026' },
  { id: 'inv7', unitNumber: 'C-304', residentName: 'Mariam Noor', amount: 12500, outstanding: 4500, period: 'Aug 2026', status: 'Overdue', dueDate: '10 Aug 2026' },
]

const initialPayments: PaymentRecord[] = [
  { id: 'p1', receiptId: 'REC-1048', residentName: 'Ahmed Raza', unitNumber: 'A-101', amount: 12500, date: '20 Aug 2026', method: 'Bank transfer' },
  { id: 'p2', receiptId: 'REC-1047', residentName: 'Usman Tariq', unitNumber: 'A-103', amount: 12500, date: '19 Aug 2026', method: 'JazzCash' },
  { id: 'p3', receiptId: 'REC-1046', residentName: 'Sana Iqbal', unitNumber: 'B-204', amount: 8000, date: '18 Aug 2026', method: 'Cash' },
  { id: 'p4', receiptId: 'REC-1045', residentName: 'Bilal Shah', unitNumber: 'C-301', amount: 12500, date: '17 Aug 2026', method: 'Bank transfer' },
]

const initialSocieties: Society[] = [
  { id: '1', name: 'Green Valley Housing Society', address: 'Green Valley, Lahore' },
  { id: '2', name: 'DHA Phase 6 Apartments', address: 'DHA Phase 6, Lahore' },
]

const initialCurrentSociety: Society = initialSocieties[0]

const initialAuditLogs: AuditLog[] = []

const initialOverdue: OverdueResident[] = [
  { id: 'or1', name: 'Fatima Khan', unitNumber: 'A-102', balance: 12500, daysOverdue: 5, lastReminderDate: '15 Aug 2026' },
  { id: 'or2', name: 'Hassan Ali', unitNumber: 'B-205', balance: 8000, daysOverdue: 8, lastReminderDate: '14 Aug 2026' },
  { id: 'or3', name: 'Sana Iqbal', unitNumber: 'B-204', balance: 4500, daysOverdue: 3, lastReminderDate: '17 Aug 2026' },
  { id: 'or4', name: 'Mariam Noor', unitNumber: 'C-304', balance: 4500, daysOverdue: 12, lastReminderDate: '10 Aug 2026' },
]

/* ── Provider ───────────────────────────────────────────── */

let nextPaymentNum = 1049
let nextInvoiceNum = 8

export function SocietyProvider({ children }: { children: React.ReactNode }) {
  const [units, setUnits] = useState<Unit[]>(initialUnits)
  const [residents, setResidents] = useState<Resident[]>(initialResidents)
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices)
  const [payments, setPayments] = useState<PaymentRecord[]>(initialPayments)
  const [overdueResidents, setOverdueResidents] = useState<OverdueResident[]>(initialOverdue)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs)
  const [societies, setSocieties] = useState<Society[]>(initialSocieties)
  const [currentSociety, setCurrentSociety] = useState<Society>(initialCurrentSociety)
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('TIER_3')
  const [adminName, setAdminName] = useState('Arham Raza')
  const [loading, setLoading] = useState(SB)

  // Refs to access current state inside callbacks without re-triggering useMemo
  const unitsRef = useRef(units)
  const residentsRef = useRef(residents)
  const overdueRef = useRef(overdueResidents)
  unitsRef.current = units
  residentsRef.current = residents
  overdueRef.current = overdueResidents

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

  const setTier = useCallback((t: SubscriptionTier) => setCurrentTier(t), [])

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
    if (SB) {
      await fetchSocietyData(societyId)
    } else {
      // Mock mode: only society '1' has data, clear for others
      if (societyId !== '1') {
        setUnits([])
        setResidents([])
        setInvoices([])
        setPayments([])
        setOverdueResidents([])
        setAuditLogs([])
      } else {
        setUnits(initialUnits)
        setResidents(initialResidents)
        setInvoices(initialInvoices)
        setPayments(initialPayments)
        setOverdueResidents(initialOverdue)
      }
    }
  }, [societies, fetchSocietyData])

  /* ── addSociety: create a new society locally (+ Supabase if configured) ── */
  const addSociety = useCallback(async (name: string, address: string) => {
    const newSociety: Society = { id: `s${Date.now()}`, name, address }
    setSocieties(prev => [...prev, newSociety])

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

    // If deleting the active society, switch to the first remaining
    if (currentSociety.id === societyId) {
      const fallback = remaining[0]
      setCurrentSociety(fallback)
      // Clear data since we're switching away
      setUnits([])
      setResidents([])
      setInvoices([])
      setPayments([])
      setOverdueResidents([])
      setAuditLogs([])
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

  const recordPayment = useCallback(async (invoiceId: string, amount: number, method: string) => {
    // --- Local state update (always, serves as optimistic update) ---
    const currentInvoices = unitsRef.current.length ? invoices : initialInvoices
    const inv = currentInvoices.find(i => i.id === invoiceId)

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
        date: fmtDate(new Date()),
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

  const generateMonthlyInvoices = useCallback(async (period: string, defaultAmount: number) => {
    const activeUnits = (unitsRef.current.length ? unitsRef.current : initialUnits).filter(u => u.occupancy === 'Occupied')
    const currentResidents = residentsRef.current.length ? residentsRef.current : initialResidents
    const currentOverdue = overdueRef.current
    const dueDay = 10
    const dueDate = `${dueDay} ${period}`

    // --- Local state update ---
    const newInvoices: Invoice[] = activeUnits.map(u => {
      const resident = currentResidents.find(r => r.unitNumber === u.unitNumber)
      return {
        id: `inv${nextInvoiceNum++}`,
        unitNumber: u.unitNumber,
        residentName: resident?.name ?? '',
        amount: defaultAmount,
        outstanding: defaultAmount,
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
      recordPayment, sendReminder, generateMonthlyInvoices, refreshData, switchSociety, addSociety, fetchSocietyData, deleteUnit, deletePayment, deleteSociety,
      canSendAutomatedReminders, canBatchGenerate, canAccessAdvancedReports, canAccessAuditLogs,
    }),
    [units, residents, invoices, payments, overdueResidents, auditLogs, currentTier, adminName, societies, currentSociety, stats, loading, setTier, setAdminName,
     recordPayment, sendReminder, generateMonthlyInvoices, refreshData, switchSociety, addSociety, fetchSocietyData, deleteUnit, deletePayment, deleteSociety,
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
