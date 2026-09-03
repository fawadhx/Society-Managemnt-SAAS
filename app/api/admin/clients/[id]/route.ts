import { NextResponse } from 'next/server'
import { getAdminClient, requireSuperAdmin } from '@/lib/supabase-server'
import { planFor, type SubscriptionTier } from '@/lib/plans'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ok, appUser } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const { id } = await params
  const b = await req.json()

  const societyPatch: Record<string, unknown> = {}
  if (typeof b.name === 'string') societyPatch.name = b.name.trim()
  if (typeof b.address === 'string') societyPatch.address = b.address.trim()
  if (b.kind === 'society' || b.kind === 'plaza') societyPatch.kind = b.kind
  if (typeof b.slug === 'string' && b.slug.trim()) societyPatch.slug = b.slug.trim().toLowerCase()
  if ('logoUrl' in b) societyPatch.logo_url = b.logoUrl || null
  if ('primaryColor' in b) societyPatch.primary_color = b.primaryColor || null
  if (b.status === 'active' || b.status === 'suspended') societyPatch.status = b.status
  if (Object.keys(societyPatch).length) {
    const { error } = await admin.from('societies').update(societyPatch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const subPatch: Record<string, unknown> = { updated_by: appUser.id, updated_at: new Date().toISOString() }
  if (b.tier) {
    const tier = b.tier as SubscriptionTier
    subPatch.tier = tier
    subPatch.included_seats = planFor(tier).includedSeats
  }
  if (typeof b.extraSeats === 'number') subPatch.extra_seats = Math.max(0, b.extraSeats)
  if (['trialing', 'active', 'past_due', 'canceled', 'expired'].includes(b.subStatus)) subPatch.status = b.subStatus
  if (typeof b.trialDays === 'number') subPatch.trial_ends_at = new Date(Date.now() + b.trialDays * 864e5).toISOString()
  if (b.extendPeriodDays) subPatch.current_period_end = new Date(Date.now() + Number(b.extendPeriodDays) * 864e5).toISOString()

  if (Object.keys(subPatch).length > 2) {
    const { error } = await admin.from('subscriptions').update(subPatch).eq('society_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await admin.from('audit_logs').insert({ society_id: id, action: 'CLIENT_UPDATED', performed_by: appUser.email, metadata: { ...societyPatch, ...subPatch } })
  return NextResponse.json({ ok: true })
}
