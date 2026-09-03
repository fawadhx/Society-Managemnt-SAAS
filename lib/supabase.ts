/**
 * Supabase browser client.
 *
 * Uses @supabase/ssr's createBrowserClient so the auth session is stored in
 * cookies and is readable by Next.js route handlers / middleware. When the
 * env vars are absent every call returns `null` and the app runs in a
 * degraded local-only demo mode (no auth).
 */

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _client: SupabaseClient | null = null

/** Returns the cached browser client, or `null` when Supabase is not configured. */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client
  if (!supabaseUrl || !supabaseAnonKey) return null
  _client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return _client
}

export function requireSupabase(): SupabaseClient {
  const client = getSupabase()
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local to enable the database.',
    )
  }
  return client
}

export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey
}
