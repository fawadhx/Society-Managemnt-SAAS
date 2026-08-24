/**
 * Supabase client — initialised only when environment variables are present.
 *
 * When NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set
 * the app talks to a real Supabase project.  When they are absent the client
 * is `null` and the React Context layer continues to serve as the source of
 * truth, letting us develop locally without a database.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _client: SupabaseClient | null = null

/**
 * Returns the initialised Supabase client, or `null` when running without
 * a configured Supabase project.  Safe to call repeatedly — the client is
 * created once and cached.
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client

  if (!supabaseUrl || !supabaseAnonKey) {
    // Development without Supabase — every call returns null so the
    // application falls back to the in-memory SocietyProvider state.
    return null
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,   // session handled by middleware / cookies
      autoRefreshToken: true,
    },
    db: {
      schema: 'public',
    },
  })

  return _client
}

/**
 * Convenience accessor — call this when you *require* a live client
 * (e.g. in server actions).  Throws in local-only mode so you never
 * accidentally hit a null path in production.
 */
export function requireSupabase(): SupabaseClient {
  const client = getSupabase()
  if (!client) {
    throw new Error(
      'Supabase is not configured.  Set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local to enable the database.',
    )
  }
  return client
}

/**
 * Quick readiness check — useful in health-check endpoints or
 * middleware to verify that the database layer is available.
 */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey
}
