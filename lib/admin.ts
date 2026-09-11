'use client'

import { getSupabase } from './supabase'
import { planFor, monthlyRevenue, societyDisplayStatus, type SubscriptionTier, type SocietySubscription } from './plans'

export type AdminClient = {
  id: string
  name: string
  slug: string
  kind: 'society' | 'plaza'
  address: string
  status: 'active' | 'suspended'
  logoUrl?: string
  primaryColor?: string
  createdAt: string
  subscription: SocietySubscription & { includedSeats: number; extraSeats: number; extraSeatPrice: number }
  seatsUsed: number
  unitCount: number
  residentCount: number
  mrr: number
  displayStatus: string
}

function subFromRow(row: Record<string, unknown> | null | undefined): AdminClient['subscription'] {
  const tier = (row?.tier as SubscriptionTier) ?? 'TIER_1'
  return {
    tier,
    status: (row?.status as SocietySubscription['status']) ?? 'trialing',
    trialEndsAt: (row?.trial_ends_at as string) ?? undefined,
    currentPeriodEnd: (row?.current_period_end as string) ?? undefined,
    includedSeats: (row?.included_seats as number) ?? planFor(tier).includedSeats,
    extraSeats: (row?.extra_seats as number) ?? 0,
    extraSeatPrice: (row?.extra_seat_price as number) ?? 500,
  }
}

export async function fetchClients(): Promise<AdminClient[]> {
  const sb = getSupabase()
  if (!sb) return []
  const [{ data: societies }, { data: subs }, { data: members }, { data: units }, { data: residents }] = await Promise.all([
    sb.from('societies').select('*').order('created_at', { ascending: false }),
    sb.from('subscriptions').select('*'),
    sb.from('society_members').select('society_id'),
    sb.from('units').select('society_id'),
    sb.from('residents').select('society_id, account_status'),
  ])
  const countBy = (rows: { society_id: string }[] | null, pred: (r: Record<string, unknown>) => boolean = () => true) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) if (pred(r)) m.set(r.society_id, (m.get(r.society_id) ?? 0) + 1)
    return m
  }
  const seatMap = countBy(members)
  const unitMap = countBy(units)
  const resMap = countBy(residents as { society_id: string }[], r => r.account_status !== 'Inactive')

  return (societies ?? []).map(s => {
    const subRow = (subs ?? []).find((x: Record<string, unknown>) => x.society_id === s.id)
    const subscription = subFromRow(subRow)
    return {
      id: s.id, name: s.name, slug: s.slug, kind: s.kind ?? 'society', address: s.address ?? '',
      status: s.status ?? 'active', logoUrl: s.logo_url ?? undefined, primaryColor: s.primary_color ?? undefined,
      createdAt: s.created_at,
      subscription,
      seatsUsed: Math.max(1, seatMap.get(s.id) ?? 1),
      unitCount: unitMap.get(s.id) ?? 0,
      residentCount: resMap.get(s.id) ?? 0,
      mrr: monthlyRevenue(subscription),
      displayStatus: societyDisplayStatus(subscription, s.status === 'suspended'),
    }
  })
}

export async function fetchClient(id: string): Promise<AdminClient | null> {
  return (await fetchClients()).find(c => c.id === id) ?? null
}

export type ClientUser = { id: string; name: string; email: string; role: string; status: string; access: 'owner' | 'editor' | 'viewer'; createdAt: string }

export async function fetchClientUsers(societyId: string): Promise<ClientUser[]> {
  const sb = getSupabase()
  if (!sb) return []
  let data = (await sb.from('society_members').select('role, access, app_users(id, name, email, status, created_at)').eq('society_id', societyId)).data as Record<string, unknown>[] | null
  if (!data) data = (await sb.from('society_members').select('role, app_users(id, name, email, status, created_at)').eq('society_id', societyId)).data as Record<string, unknown>[] | null
  return (data ?? []).flatMap((r: Record<string, unknown>) => {
    const u = r.app_users as Record<string, unknown> | null
    return u ? [{
      id: u.id as string, name: u.name as string, email: u.email as string, role: r.role as string,
      status: u.status as string, access: (r.access as ClientUser['access']) ?? 'editor', createdAt: u.created_at as string,
    }] : []
  })
}

export type ActivityEntry = { id: string; action: string; performedBy: string; metadata: Record<string, unknown>; timestamp: string }

export async function fetchClientActivity(societyId: string, userId?: string): Promise<ActivityEntry[]> {
  const sb = getSupabase()
  if (!sb) return []
  let q = sb.from('audit_logs').select('id, action, performed_by, metadata, timestamp').eq('society_id', societyId).order('timestamp', { ascending: false }).limit(200)
  if (userId) q = q.eq('user_id', userId)
  const { data } = await q
  return (data ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string, action: l.action as string, performedBy: l.performed_by as string,
    metadata: (typeof l.metadata === 'object' && l.metadata ? l.metadata : {}) as Record<string, unknown>, timestamp: l.timestamp as string,
  }))
}

export type PlanRequest = { id: string; societyId: string; societyName: string; kind: string; detail: string; status: string; createdAt: string }

export async function fetchPlanRequests(societyId?: string): Promise<PlanRequest[]> {
  const sb = getSupabase()
  if (!sb) return []
  let query = sb.from('plan_change_requests').select('id, society_id, kind, detail, status, created_at, societies(name)').eq('status', 'open').order('created_at', { ascending: false })
  if (societyId) query = query.eq('society_id', societyId)
  const { data } = await query
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, societyId: r.society_id as string,
    societyName: (r.societies as Record<string, unknown> | null)?.name as string ?? '—',
    kind: r.kind as string, detail: r.detail as string, status: r.status as string, createdAt: r.created_at as string,
  }))
}

/* ── Mutations via signed admin API routes ─────────────── */

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

export type CreateClientInput = {
  name: string; kind: 'society' | 'plaza'; tier: SubscriptionTier; address?: string
  extraSeats: number; billing: 'trial' | 'active'; trialDays: number
  adminName: string; adminEmail: string; adminPassword: string
  logoUrl?: string; primaryColor?: string
}

export const createClient = (input: CreateClientInput) => api('/api/admin/clients', 'POST', input)
export const updateClient = (id: string, patch: Record<string, unknown>) => api(`/api/admin/clients/${id}`, 'PATCH', patch)
export const addClientUser = (id: string, user: { name: string; email: string; password: string; access: string }) => api(`/api/admin/clients/${id}/users`, 'POST', user)
export const removeClientUser = (id: string, userId: string) => api(`/api/admin/clients/${id}/users`, 'DELETE', { userId })
export const resetClientUserPassword = (id: string, userId: string, password: string) => api(`/api/admin/clients/${id}/users`, 'PUT', { userId, password })
export const setClientUserAccess = (id: string, userId: string, access: string) => api(`/api/admin/clients/${id}/users`, 'PATCH', { userId, access })
export const resolveRequest = (id: string, status: 'done' | 'declined') => api(`/api/admin/requests/${id}`, 'PATCH', { status })
