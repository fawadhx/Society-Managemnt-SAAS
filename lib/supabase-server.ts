/**
 * Server-side Supabase clients for route handlers.
 *
 *  - getServerClient()  → acts as the signed-in user (RLS enforced). Reads the
 *    auth cookie set by the browser client.
 *  - getAdminClient()   → service-role client that bypasses RLS. ONLY use inside
 *    route handlers that have already verified the caller is a SUPER_ADMIN.
 *    Requires SUPABASE_SERVICE_ROLE_KEY (server-only env var).
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function getServerClient(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) return null
  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // called from a Server Component — safe to ignore, middleware refreshes.
        }
      },
    },
  })
}

export function getAdminClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Resolve the calling user's app_users row, or null if not signed in. */
export async function getCurrentAppUser() {
  const sb = await getServerClient()
  if (!sb) return null
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) return null
  const { data: appUser } = await sb.from('app_users').select('*').eq('id', auth.user.id).single()
  return appUser ?? null
}

export async function requireSuperAdmin() {
  const appUser = await getCurrentAppUser()
  if (!appUser || appUser.role !== 'SUPER_ADMIN' || appUser.status !== 'Active') {
    return { ok: false as const, appUser: null }
  }
  return { ok: true as const, appUser }
}
