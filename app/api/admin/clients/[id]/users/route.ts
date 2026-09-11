import { NextResponse } from 'next/server'
import { getAdminClient, requireSuperAdmin } from '@/lib/supabase-server'
import { planFor } from '@/lib/plans'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ok, appUser } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const { id } = await params
  const b = await req.json()
  if (!b.email || !b.password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  if (String(b.password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  // seat capacity
  const [{ data: sub }, { count }] = await Promise.all([
    admin.from('subscriptions').select('tier, included_seats, extra_seats').eq('society_id', id).single(),
    admin.from('society_members').select('*', { count: 'exact', head: true }).eq('society_id', id),
  ])
  const total = (sub?.included_seats ?? planFor(sub?.tier).includedSeats) + (sub?.extra_seats ?? 0)
  if ((count ?? 0) >= total) {
    return NextResponse.json({ error: `Seat limit reached (${count}/${total}). Add a seat first.` }, { status: 400 })
  }

  const access = ['owner', 'editor', 'viewer'].includes(b.access) ? b.access : 'editor'
  const email = String(b.email).trim().toLowerCase()
  const { data: existing } = await admin.from('app_users').select('id').eq('email', email).maybeSingle()
  let userId = existing?.id as string | undefined
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: String(b.password), email_confirm: true,
      user_metadata: { name: (b.name ?? '').trim() || email.split('@')[0], role: 'SOCIETY_ADMIN' },
    })
    if (error || !created.user) return NextResponse.json({ error: error?.message ?? 'Could not create the user.' }, { status: 400 })
    userId = created.user.id
  }

  let { error: memErr } = await admin.from('society_members').insert({ society_id: id, user_id: userId, role: 'SOCIETY_ADMIN', access })
  if (memErr && /access/.test(memErr.message)) {
    ;({ error: memErr } = await admin.from('society_members').insert({ society_id: id, user_id: userId, role: 'SOCIETY_ADMIN' }))
  }
  if (memErr) return NextResponse.json({ error: memErr.message.includes('duplicate') ? 'Already on the team.' : memErr.message }, { status: 400 })
  await admin.from('audit_logs').insert({ society_id: id, action: 'SEAT_ADDED', performed_by: appUser.email, metadata: { email, access } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ok } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const { id } = await params
  const { userId, access } = await req.json()
  if (!userId || !['owner', 'editor', 'viewer'].includes(access)) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { error } = await admin.from('society_members').update({ access }).eq('society_id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: /access/.test(error.message) ? 'Access levels need a DB update — run lib/schema-migration.sql in Supabase.' : error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

/**
 * Reset a member's password. The super admin sets a temporary password; the
 * user is forced to choose a new one on their next login.
 *
 * The password is hashed by Supabase Auth via `admin.auth.admin.updateUserById`
 * — exactly the same path `admin.auth.admin.createUser` uses. No plaintext of
 * the existing password is ever read or exposed.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ok, appUser } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const { id } = await params
  const { userId, password } = await req.json()
  if (!userId || typeof password !== 'string') return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  // The target must actually be a member of this client's workspace.
  const { data: member } = await admin.from('society_members').select('user_id')
    .eq('society_id', id).eq('user_id', userId).maybeSingle()
  if (!member) return NextResponse.json({ error: 'That user is not on this workspace.' }, { status: 404 })
  const { data: target } = await admin.from('app_users').select('email').eq('id', userId).maybeSingle()

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await admin.from('app_users').update({ must_change_password: true }).eq('id', userId)
  await admin.from('audit_logs').insert({
    society_id: id, user_id: userId, action: 'PASSWORD_RESET',
    performed_by: appUser.email, metadata: { user: target?.email ?? userId },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ok, appUser } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const { id } = await params
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })

  await admin.from('society_members').delete().eq('society_id', id).eq('user_id', userId)
  const { count } = await admin.from('society_members').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  if ((count ?? 0) === 0) await admin.auth.admin.deleteUser(userId).catch(() => {})
  await admin.from('audit_logs').insert({ society_id: id, action: 'SEAT_REMOVED', performed_by: appUser.email, metadata: { userId } })
  return NextResponse.json({ ok: true })
}
