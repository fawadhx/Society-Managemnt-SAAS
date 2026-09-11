import { NextResponse } from 'next/server'
import { getAdminClient, getCurrentAppUser } from '@/lib/supabase-server'

/**
 * Completes an admin-initiated forced password reset for the *currently
 * signed-in* user: sets the new password (hashed by Supabase Auth — the same
 * path as `admin.auth.admin.createUser`) and clears `must_change_password`.
 *
 * Doing both here, server-side, means the flag can never be cleared without a
 * real password change actually going through.
 */
export async function POST(req: Request) {
  const appUser = await getCurrentAppUser()
  if (!appUser) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { password } = await req.json().catch(() => ({}))
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })

  const { error } = await admin.auth.admin.updateUserById(appUser.id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await admin.from('app_users').update({ must_change_password: false }).eq('id', appUser.id)
  return NextResponse.json({ ok: true })
}
