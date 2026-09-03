import { NextResponse } from 'next/server'
import { getAdminClient, requireSuperAdmin } from '@/lib/supabase-server'
import { planFor, type SubscriptionTier } from '@/lib/plans'

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client'
}

export async function GET() {
  const { ok } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  const { data } = await admin.from('societies').select('*').order('created_at', { ascending: false })
  return NextResponse.json({ societies: data ?? [] })
}

export async function POST(req: Request) {
  const { ok, appUser } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })

  const b = await req.json()
  const name: string = (b.name ?? '').trim()
  const tier: SubscriptionTier = b.tier ?? 'TIER_1'
  const kind = b.kind === 'plaza' ? 'plaza' : 'society'
  if (!name) return NextResponse.json({ error: 'Client name is required.' }, { status: 400 })
  if (!b.adminEmail || !b.adminPassword) return NextResponse.json({ error: 'Admin email and password are required.' }, { status: 400 })
  if (String(b.adminPassword).length < 8) return NextResponse.json({ error: 'Admin password must be at least 8 characters.' }, { status: 400 })

  // unique slug
  let slug = slugify(name)
  const { data: taken } = await admin.from('societies').select('slug').like('slug', `${slug}%`)
  if ((taken ?? []).some((s: { slug: string }) => s.slug === slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

  // 1. create the auth user for the first admin
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: String(b.adminEmail).trim().toLowerCase(),
    password: String(b.adminPassword),
    email_confirm: true,
    user_metadata: { name: (b.adminName ?? '').trim() || String(b.adminEmail).split('@')[0], role: 'SOCIETY_ADMIN' },
  })
  if (userErr || !created.user) return NextResponse.json({ error: userErr?.message ?? 'Could not create the admin user.' }, { status: 400 })
  const userId = created.user.id

  // 2. society
  const { data: society, error: socErr } = await admin.from('societies').insert({
    name, slug, kind, address: (b.address ?? '').trim(),
    logo_url: b.logoUrl || null, primary_color: b.primaryColor || null,
    default_fee: 0, created_by: appUser.id,
  }).select('id, slug').single()
  if (socErr || !society) {
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    return NextResponse.json({ error: socErr?.message ?? 'Could not create the society.' }, { status: 400 })
  }

  // 3. membership + subscription + receipt counter
  const plan = planFor(tier)
  const trialDays = Number(b.trialDays ?? 14)
  const now = Date.now()
  const subscription = b.billing === 'active'
    ? { status: 'active', current_period_end: new Date(now + 30 * 864e5).toISOString(), trial_ends_at: null }
    : { status: 'trialing', trial_ends_at: new Date(now + trialDays * 864e5).toISOString(), current_period_end: null }

  const mem = await admin.from('society_members').insert({ society_id: society.id, user_id: userId, role: 'SOCIETY_ADMIN', access: 'owner' })
  if (mem.error && /access/.test(mem.error.message)) {
    await admin.from('society_members').insert({ society_id: society.id, user_id: userId, role: 'SOCIETY_ADMIN' })
  }
  await admin.from('subscriptions').insert({
    society_id: society.id, tier, ...subscription,
    included_seats: plan.includedSeats, extra_seats: Math.max(0, Number(b.extraSeats ?? 0)), extra_seat_price: 500,
    updated_by: appUser.id,
  })
  await admin.from('receipt_counters').insert({ society_id: society.id, next_number: 1000 })
  await admin.from('audit_logs').insert({ society_id: society.id, action: 'CLIENT_PROVISIONED', performed_by: appUser.email, metadata: { tier, kind, billing: subscription.status } })

  return NextResponse.json({ id: society.id, slug: society.slug })
}
