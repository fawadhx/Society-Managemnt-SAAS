/**
 * Seed script — populates the Supabase database with sample data for testing.
 *
 * Usage (from browser console or a dev-only button):
 *   import { seedDatabase } from '@/lib/seed'
 *   await seedDatabase()
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to be set.
 */

import { getSupabase, requireSupabase } from './supabase'

/* ── Seed data ──────────────────────────────────────────── */

const SOCIETY = {
  name: 'Green Valley Housing Society',
  address: 'Main Boulevard, Phase 5, DHA, Lahore',
  tier: 'TIER_3' as const,
  default_fee: 12500,
}

const UNITS = [
  { unit_number: 'A-101', owner_name: 'Ahmed Raza',   phone: '0300 1234567', status: 'Occupied' },
  { unit_number: 'A-102', owner_name: 'Fatima Khan',   phone: '0312 5550142', status: 'Occupied' },
  { unit_number: 'A-103', owner_name: 'Usman Tariq',   phone: '0333 8211004', status: 'Occupied' },
  { unit_number: 'B-204', owner_name: 'Sana Iqbal',    phone: '0301 4412233', status: 'Occupied' },
  { unit_number: 'B-205', owner_name: 'Hassan Ali',    phone: '0321 7789001', status: 'Occupied' },
  { unit_number: 'C-301', owner_name: 'Bilal Shah',    phone: '0300 5551234', status: 'Vacant'   },
  { unit_number: 'C-304', owner_name: 'Mariam Noor',   phone: '0311 9990876', status: 'Occupied' },
]

/**
 * Inserts seed data into Supabase and returns a summary of what was created.
 * Idempotent: deletes existing society data first to avoid duplicates on re-run.
 */
export async function seedDatabase(): Promise<{
  societyId: string
  units: number
  invoices: number
  payments: number
}> {
  const sb = requireSupabase()

  // ── 1. Upsert society ─────────────────────────────────
  const { data: existingSociety } = await sb
    .from('societies')
    .select('id')
    .eq('name', SOCIETY.name)
    .limit(1)
    .single()

  let societyId: string

  if (existingSociety) {
    // Re-seed: delete existing data for this society (cascades via FK)
    societyId = existingSociety.id
    await sb.from('audit_logs').delete().eq('society_id', societyId)
    await sb.from('payments').delete().in('invoice_id',
      (await sb.from('invoices').select('id').in('unit_id',
        (await sb.from('units').select('id').eq('society_id', societyId)).data?.map((u: { id: string }) => u.id) ?? []
      )).data?.map((i: { id: string }) => i.id) ?? []
    )
    await sb.from('invoices').delete().in('unit_id',
      (await sb.from('units').select('id').eq('society_id', societyId)).data?.map((u: { id: string }) => u.id) ?? []
    )
    await sb.from('units').delete().eq('society_id', societyId)
    await sb.from('societies').update({ tier: SOCIETY.tier, default_fee: SOCIETY.default_fee }).eq('id', societyId)
  } else {
    const { data } = await sb.from('societies').insert({
      name: SOCIETY.name,
      address: SOCIETY.address,
      tier: SOCIETY.tier,
      default_fee: SOCIETY.default_fee,
    }).select('id').single()
    societyId = data!.id
  }

  // ── 2. Insert units ───────────────────────────────────
  const unitRows = UNITS.map(u => ({ ...u, society_id: societyId }))
  const { data: insertedUnits } = await sb.from('units').insert(unitRows).select('id, unit_number')
  const unitIdMap = new Map<string, string>()
  for (const u of insertedUnits ?? []) {
    unitIdMap.set(u.unit_number, u.id)
  }

  // ── 3. Insert sample invoices (Aug 2026) ──────────────
  const invoiceStatuses: Record<string, { status: string; outstanding: number }> = {
    'A-101': { status: 'Paid',    outstanding: 0 },
    'A-102': { status: 'Overdue', outstanding: 12500 },
    'A-103': { status: 'Paid',    outstanding: 0 },
    'B-204': { status: 'Partial', outstanding: 4500 },
    'B-205': { status: 'Overdue', outstanding: 8000 },
    'C-304': { status: 'Overdue', outstanding: 4500 },
  }

  const invoiceInserts = Object.entries(invoiceStatuses).map(([unitNum, info]) => ({
    unit_id: unitIdMap.get(unitNum)!,
    period: 'Aug 2026',
    amount: 12500,
    outstanding: info.outstanding,
    status: info.status,
    due_date: '2026-08-10',
  }))

  const { data: insertedInvoices } = await sb.from('invoices').insert(invoiceInserts).select('id, unit_id')
  const invoiceIdMap = new Map<string, string>()
  for (const inv of insertedInvoices ?? []) {
    // Map unit_id → invoice_id
    for (const [unitNum, unitId] of unitIdMap.entries()) {
      if (inv.unit_id === unitId) {
        invoiceIdMap.set(unitNum, inv.id)
        break
      }
    }
  }

  // ── 4. Insert sample payments ─────────────────────────
  const paymentInserts = [
    { invoiceId: 'A-101', amount_paid: 12500, method: 'Bank Transfer', receipt_number: 'REC-1048', created_at: '2026-08-20T10:00:00Z' },
    { invoiceId: 'A-103', amount_paid: 12500, method: 'JazzCash',      receipt_number: 'REC-1047', created_at: '2026-08-19T14:30:00Z' },
    { invoiceId: 'B-204', amount_paid: 8000,  method: 'Cash',          receipt_number: 'REC-1046', created_at: '2026-08-18T09:15:00Z' },
  ].filter(p => invoiceIdMap.has(p.invoiceId))
    .map(p => ({
      invoice_id: invoiceIdMap.get(p.invoiceId)!,
      amount_paid: p.amount_paid,
      method: p.method,
      receipt_number: p.receipt_number,
      created_at: p.created_at,
    }))

  if (paymentInserts.length > 0) {
    await sb.from('payments').insert(paymentInserts)
  }

  // ── 5. Seed an audit log entry ────────────────────────
  await sb.from('audit_logs').insert({
    society_id: societyId,
    action: 'SEED_COMPLETED',
    performed_by: 'system',
    metadata: { unit_count: UNITS.length, invoice_count: invoiceInserts.length },
  })

  return {
    societyId,
    units: insertedUnits?.length ?? 0,
    invoices: insertedInvoices?.length ?? 0,
    payments: paymentInserts.length,
  }
}

/**
 * Quick check — returns true if the seed data already exists.
 */
export async function isSeeded(): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false

  const { count } = await sb
    .from('societies')
    .select('*', { count: 'exact', head: true })
    .eq('name', SOCIETY.name)

  return (count ?? 0) > 0
}
