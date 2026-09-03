'use client'

/**
 * Auth context — Supabase-backed accounts, sessions and roles.
 *
 * Roles:
 *   SUPER_ADMIN    platform administrator — provisions & manages every tenant
 *   SOCIETY_ADMIN  administrator of one or more societies/plazas they belong to
 *
 * The signed-in user's role lives in `app_users.role`; the societies they may
 * access come from `society_members`. A SUPER_ADMIN accesses any tenant by
 * "opening" it (impersonation), tracked in localStorage.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from './supabase'

export type UserRole = 'SUPER_ADMIN' | 'SOCIETY_ADMIN'
export type UserStatus = 'Active' | 'Suspended'

export type AppUser = {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
}

export type Access = 'owner' | 'editor' | 'viewer'

export type Membership = {
  societyId: string
  slug: string
  name: string
  kind: 'society' | 'plaza'
  role: UserRole
  access: Access
}

type AuthActions = {
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  updateProfile: (updates: { name?: string }) => Promise<{ ok: boolean; error?: string }>
  changePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>
  refresh: () => Promise<void>
  /** Super Admin only: drill into a specific society workspace. */
  viewSociety: (societyId: string) => void
  exitSocietyView: () => void
}

type AuthContextValue = {
  user: AppUser | null
  memberships: Membership[]
  authReady: boolean
  configured: boolean
  isSuperAdmin: boolean
  /** Society the user is currently working in (a membership, or the impersonated one). */
  viewingSocietyId: string | null
  /** The signed-in user's access level in the society they're currently viewing. */
  myAccess: Access
  /**
   * Where this user belongs, or null. Every redirector page routes to exactly
   * this — so the redirects form a tree, never a cycle.
   *   '/login'  no session
   *   '/admin'  super admin
   *   '/<slug>' has at least one workspace
   *   null      logged in but attached to no workspace (dead-end, show a message)
   */
  homePath: string | null
} & AuthActions

const AuthContext = createContext<AuthContextValue | null>(null)

const IMPERSONATE_KEY = 'sm_view_society'

function lsGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* noop */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured()
  const [user, setUser] = useState<AppUser | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [authReady, setAuthReady] = useState(!configured)
  const [viewingSocietyId, setViewingSocietyId] = useState<string | null>(null)

  const loadingRef = useRef(false)
  const loadProfile = useCallback(async () => {
    const sb = getSupabase()
    if (!sb) { setUser(null); setMemberships([]); return }
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      // getSession reads the local token — reliable and never transiently "logs out".
      const { data: { session } } = await sb.auth.getSession()
      const su = session?.user
      if (!su) { setUser(null); setMemberships([]); setViewingSocietyId(null); return }

      // Baseline identity from the session so a briefly-unreadable profile row
      // can never bounce the user back to /login.
      let resolved: AppUser = {
        id: su.id,
        name: (su.user_metadata?.name as string) || (su.email?.split('@')[0] ?? 'User'),
        email: su.email ?? '',
        role: ((su.user_metadata?.role as UserRole) === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SOCIETY_ADMIN'),
        status: 'Active',
      }
      const { data: appUser } = await sb.from('app_users').select('*').eq('id', su.id).maybeSingle()
      if (appUser) {
        resolved = {
          id: appUser.id, name: appUser.name, email: appUser.email,
          role: appUser.role as UserRole, status: appUser.status as UserStatus,
        }
      }
      setUser(prev => (prev && prev.id === resolved.id && prev.name === resolved.name && prev.email === resolved.email
        && prev.role === resolved.role && prev.status === resolved.status) ? prev : resolved)

      let rows = (await sb
        .from('society_members')
        .select('role, access, societies(id, slug, name, kind)')
        .eq('user_id', su.id)).data as Record<string, unknown>[] | null
      // DB not migrated yet (no `access` column) → retry without it.
      if (!rows) {
        rows = (await sb.from('society_members').select('role, societies(id, slug, name, kind)').eq('user_id', su.id)).data as Record<string, unknown>[] | null
      }
      const list: Membership[] = (rows ?? []).flatMap((r: Record<string, unknown>) => {
        const s = r.societies as Record<string, unknown> | null
        if (!s) return []
        return [{
          societyId: s.id as string, slug: s.slug as string, name: s.name as string,
          kind: (s.kind as 'society' | 'plaza') ?? 'society', role: r.role as UserRole,
          access: (r.access as Access) ?? 'editor',
        }]
      })
      setMemberships(prev => JSON.stringify(prev) === JSON.stringify(list) ? prev : list)

      if (resolved.role !== 'SUPER_ADMIN') {
        setViewingSocietyId(list[0]?.societyId ?? null)
        lsSet(IMPERSONATE_KEY, null)
      } else {
        setViewingSocietyId(prev => prev ?? lsGet(IMPERSONATE_KEY))
      }
    } finally {
      loadingRef.current = false
    }
  }, [])

  const bootRef = useRef(false)
  useEffect(() => {
    if (!configured || bootRef.current) return
    bootRef.current = true
    const sb = getSupabase()
    if (!sb) { setAuthReady(true); return }
    void loadProfile().finally(() => setAuthReady(true))
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null); setMemberships([]); setViewingSocietyId(null)
        return
      }
      // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION — re-read,
      // but loadProfile is idempotent and only clears on a real sign-out.
      void loadProfile()
    })
    return () => sub.subscription.unsubscribe()
  }, [configured, loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase()
    if (!sb) return { ok: false, error: 'Supabase is not configured on this deployment.' }
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) return { ok: false, error: error.message || 'Incorrect email or password.' }
    await loadProfile()
    return { ok: true }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    const sb = getSupabase()
    lsSet(IMPERSONATE_KEY, null)
    setViewingSocietyId(null)
    setUser(null)
    setMemberships([])
    await sb?.auth.signOut()
  }, [])

  const updateProfile = useCallback(async (updates: { name?: string }) => {
    const sb = getSupabase()
    if (!sb || !user) return { ok: false, error: 'Not signed in.' }
    const name = updates.name?.trim()
    if (!name) return { ok: false, error: 'Name cannot be empty.' }
    const { error } = await sb.from('app_users').update({ name }).eq('id', user.id)
    if (error) return { ok: false, error: error.message }
    await sb.auth.updateUser({ data: { name } })
    setUser(u => u ? { ...u, name } : u)
    return { ok: true }
  }, [user])

  const changePassword = useCallback(async (newPassword: string) => {
    const sb = getSupabase()
    if (!sb) return { ok: false, error: 'Not configured.' }
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' }
    const { error } = await sb.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }, [])

  const viewSociety = useCallback((societyId: string) => {
    setViewingSocietyId(societyId)
    lsSet(IMPERSONATE_KEY, societyId)
  }, [])

  const exitSocietyView = useCallback(() => {
    setViewingSocietyId(null)
    lsSet(IMPERSONATE_KEY, null)
  }, [])

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const myAccess: Access = isSuperAdmin
    ? 'owner'
    : (memberships.find(m => m.societyId === viewingSocietyId)?.access ?? 'viewer')
  const homePath: string | null = !configured || !user
    ? '/login'
    : isSuperAdmin
      ? '/admin'
      : memberships[0]
        ? `/${memberships[0].slug}`
        : null

  const value = useMemo<AuthContextValue>(() => ({
    user, memberships, authReady, configured,
    isSuperAdmin,
    viewingSocietyId, myAccess, homePath,
    signIn, signOut, updateProfile, changePassword, refresh: loadProfile,
    viewSociety, exitSocietyView,
  }), [user, memberships, authReady, configured, viewingSocietyId, isSuperAdmin, myAccess, homePath,
      signIn, signOut, updateProfile, changePassword, loadProfile, viewSociety, exitSocietyView])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
