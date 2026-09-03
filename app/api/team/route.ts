import { NextResponse } from 'next/server'
import { getAdminClient, getCurrentAppUser } from '@/lib/supabase-server'
import { planFor } from '@/lib/plans'

/** True when the signed-in user may manage this society's team (owner, or a SUPER_ADMIN). */
async function assertOwner(societyId: string) {
  const appUser = await getCurrentAppUser()
  if (!appUser) return { ok: false as const, code: 401, appUser: null }
  if (appUser.role === 'SUPER_ADMIN') return { ok: true as const, appUser }
  const admin = getAdminClient()
  if (!admin) return { ok: false as const, code: 500, appUser }
  const { data: members } = await admin.from('society_members')
    .select('user_id, access, created_at').eq('society_id', societyId).order('created_at', { ascending: true })
  const list = members ?? []
  const mine = list.find(m => m.user_id === appUser.id)
  if (!mine) return { ok: false as const, code: 403, appUser }
  // Explicit owner, or — on a workspace that has no owner yet (un-migrated DB) —
  // the person who joined first.
  const hasOwner = list.some(m => m.access === 'owner')
  if (mine.access === 'owner' || (!hasOwner && list[0]?.user_id === appUser.id)) {
    return { ok: true as const, appUser }
  }
  return { ok: false as const, code: 403, appUser }
}

export async function GET(req: Request) {
  const societyId = new URL(req.url).searchParams.get('societyId') ?? ''
  const guard = await assertOwner(societyId)
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.code })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  let data = (await admin.from('society_members')
    .select('access, role, app_users(id, name, email, status, created_at)')
    .eq('society_id', societyId)).data as Record<string, unknown>[] | null
  if (!data) {
    data = (await admin.from('society_members')
      .select('role, app_users(id, name, email, status, created_at)')
      .eq('society_id', societyId)).data as Record<string, unknown>[] | null
  }
  const members = (data ?? []).flatMap((r: Record<string, unknown>) => {
    const u = r.app_users as Record<string, unknown> | null
    return u ? [{ id: u.id, name: u.name, email: u.email, status: u.status, createdAt: u.created_at, access: r.access ?? 'editor', role: r.role }] : []
  })
  return NextResponse.json({ members })
}

export async function POST(req: Request) {
  const b = await req.json()
  const societyId: string = b.societyId
  const guard = await assertOwner(societyId)
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.code })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })

  const email = String(b.email ?? '').trim().toLowerCase()
  const access = ['owner', 'editor', 'viewer'].includes(b.access) ? b.access : 'viewer'
  if (!email.includes('@')) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
  if (String(b.password ?? '').length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  // Seat capacity
  const [{ data: sub }, { count }] = await Promise.all([
    admin.from('subscriptions').select('tier, included_seats, extra_seats').eq('society_id', societyId).single(),
    admin.from('society_members').select('*', { count: 'exact', head: true }).eq('society_id', societyId),
  ])
  const total = (sub?.included_seats ?? planFor(sub?.tier).includedSeats) + (sub?.extra_seats ?? 0)
  if ((count ?? 0) >= total) {
    return NextResponse.json({ error: `Seat limit reached (${count}/${total}). Ask your provider to add a seat.` }, { status: 400 })
  }

  // Reuse an existing account if the email already has one, else create it.
  let userId: string | undefined
  const { data: existing } = await admin.from('app_users').select('id').eq('email', email).maybeSingle()
  if (existing) {
    userId = existing.id
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: String(b.password), email_confirm: true,
      user_metadata: { name: String(b.name ?? '').trim() || email.split('@')[0], role: 'SOCIETY_ADMIN' },
    })
    if (error || !created.user) return NextResponse.json({ error: error?.message ?? 'Could not create the user.' }, { status: 400 })
    userId = created.user.id
  }

  let { error: memErr } = await admin.from('society_members').insert({ society_id: societyId, user_id: userId, role: 'SOCIETY_ADMIN', access })
  if (memErr && /access/.test(memErr.message)) {
    // Column not added yet — add the member anyway at the default level.
    ;({ error: memErr } = await admin.from('society_members').insert({ society_id: societyId, user_id: userId, role: 'SOCIETY_ADMIN' }))
  }
  if (memErr) return NextResponse.json({ error: memErr.message.includes('duplicate') ? 'That user is already on the team.' : memErr.message }, { status: 400 })
  await admin.from('audit_logs').insert({ society_id: societyId, user_id: guard.appUser?.id ?? null, action: 'TEAM_MEMBER_ADDED', performed_by: guard.appUser?.email ?? 'owner', metadata: { email, access } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const b = await req.json()
  const societyId: string = b.societyId
  const guard = await assertOwner(societyId)
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.code })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const access = ['owner', 'editor', 'viewer'].includes(b.access) ? b.access : null
  if (!access || !b.userId) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })

  // Never leave a society without an owner.
  if (access !== 'owner') {
    const { count } = await admin.from('society_members').select('*', { count: 'exact', head: true }).eq('society_id', societyId).eq('access', 'owner')
    const { data: target } = await admin.from('society_members').select('access').eq('society_id', societyId).eq('user_id', b.userId).single()
    if (target?.access === 'owner' && (count ?? 0) <= 1) {
      return NextResponse.json({ error: 'This is the only owner — promote someone else first.' }, { status: 400 })
    }
  }
  const { error } = await admin.from('society_members').update({ access }).eq('society_id', societyId).eq('user_id', b.userId)
  if (error) return NextResponse.json({ error: /access/.test(error.message) ? 'Access levels need a DB update — run lib/schema-migration.sql in Supabase.' : error.message }, { status: 400 })
  await admin.from('audit_logs').insert({ society_id: societyId, user_id: guard.appUser?.id ?? null, action: 'TEAM_ACCESS_CHANGED', performed_by: guard.appUser?.email ?? 'owner', metadata: { userId: b.userId, access } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const b = await req.json()
  const societyId: string = b.societyId
  const guard = await assertOwner(societyId)
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.code })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  if (!b.userId) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  if (b.userId === guard.appUser?.id) return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 })

  const { data: target } = await admin.from('society_members').select('access').eq('society_id', societyId).eq('user_id', b.userId).single()
  if (target?.access === 'owner') return NextResponse.json({ error: 'Transfer ownership before removing this person.' }, { status: 400 })

  await admin.from('society_members').delete().eq('society_id', societyId).eq('user_id', b.userId)
  // If they belong to no other society and aren't a super admin, remove the login entirely.
  const [{ count }, { data: u }] = await Promise.all([
    admin.from('society_members').select('*', { count: 'exact', head: true }).eq('user_id', b.userId),
    admin.from('app_users').select('role').eq('id', b.userId).single(),
  ])
  if ((count ?? 0) === 0 && u?.role !== 'SUPER_ADMIN') await admin.auth.admin.deleteUser(b.userId).catch(() => {})
  await admin.from('audit_logs').insert({ society_id: societyId, user_id: guard.appUser?.id ?? null, action: 'TEAM_MEMBER_REMOVED', performed_by: guard.appUser?.email ?? 'owner', metadata: { userId: b.userId } })
  return NextResponse.json({ ok: true })
}
