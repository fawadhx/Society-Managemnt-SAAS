/**
 * Demo-data seeder — fills the CURRENT society with sample units, residents,
 * invoices and payments so a fresh workspace has something to show. Runs as the
 * signed-in user (RLS-scoped); safe because it only touches this society.
 */

import { getSupabase } from './supabase'

const UNITS = [
  { unit_number: 'A-101', block: 'A', monthly_charge: 12500, resident: { name: 'Ahmed Raza', phone: '0300 1234567' } },
  { unit_number: 'A-102', block: 'A', monthly_charge: 12500, resident: { name: 'Fatima Khan', phone: '0312 5550142' } },
  { unit_number: 'A-103', block: 'A', monthly_charge: 15000, resident: { name: 'Usman Tariq', phone: '0333 8211004' } },
  { unit_number: 'B-204', block: 'B', monthly_charge: 18000, resident: { name: 'Sana Iqbal', phone: '0301 4412233' } },
  { unit_number: 'B-205', block: 'B', monthly_charge: 18000, resident: { name: 'Hassan Ali', phone: '0321 7789001' } },
  { unit_number: 'C-301', block: 'C', monthly_charge: 12500, resident: null },
  { unit_number: 'C-304', block: 'C', monthly_charge: 22000, resident: { name: 'Mariam Noor', phone: '0311 9990876' } },
]

export async function seedCurrentSociety(societyId: string): Promise<{ units: number; residents: number; invoices: number }> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured.')

  // Wipe existing rows for this society (RLS keeps us inside our own tenant).
  await sb.from('payments').delete().eq('society_id', societyId)
  await sb.from('invoices').delete().eq('society_id', societyId)
  await sb.from('residents').delete().eq('society_id', societyId)
  await sb.from('units').delete().eq('society_id', societyId)

  const { data: unitRows } = await sb.from('units').insert(
    UNITS.map(u => ({
      society_id: societyId, unit_number: u.unit_number, block: u.block, type: 'Apartment',
      monthly_charge: u.monthly_charge, status: u.resident ? 'Occupied' : 'Vacant',
    })),
  ).select('id, unit_number')

  const idOf = new Map<string, string>((unitRows ?? []).map(r => [r.unit_number as string, r.id as string]))

  const residentRows = UNITS.filter(u => u.resident).map(u => ({
    society_id: societyId, unit_id: idOf.get(u.unit_number)!, name: u.resident!.name,
    phone: u.resident!.phone, security_deposit: u.monthly_charge, account_status: 'Active',
  }))
  await sb.from('residents').insert(residentRows)

  const period = new Date().toLocaleString('en', { month: 'long', year: 'numeric' })
  const due = new Date(); due.setDate(10)
  const invoiceRows = UNITS.filter(u => u.resident).map((u, i) => {
    const paidFully = i % 3 === 0
    const partial = i % 3 === 1
    return {
      society_id: societyId, unit_id: idOf.get(u.unit_number)!, resident_name: u.resident!.name,
      period, amount: u.monthly_charge,
      outstanding: paidFully ? 0 : partial ? Math.round(u.monthly_charge / 2) : u.monthly_charge,
      status: paidFully ? 'Paid' : partial ? 'Partial' : 'Pending',
      due_date: due.toISOString().slice(0, 10),
    }
  })
  const { data: invRows } = await sb.from('invoices').insert(invoiceRows).select('id, unit_id, amount, outstanding')

  const paymentRows = (invRows ?? [])
    .filter(inv => Number(inv.amount) - Number(inv.outstanding) > 0)
    .map((inv, i) => ({
      society_id: societyId, invoice_id: inv.id as string,
      amount_paid: Number(inv.amount) - Number(inv.outstanding),
      method: (['Bank Transfer', 'JazzCash', 'EasyPaisa', 'Cash'] as const)[i % 4],
      receipt_number: `REC-${1000 + i}`, paid_on: new Date().toISOString().slice(0, 10),
    }))
  if (paymentRows.length) await sb.from('payments').insert(paymentRows)

  await sb.from('audit_logs').insert({ society_id: societyId, action: 'DEMO_DATA_SEEDED', performed_by: 'system', metadata: { units: UNITS.length } })

  return { units: unitRows?.length ?? 0, residents: residentRows.length, invoices: invRows?.length ?? 0 }
}
