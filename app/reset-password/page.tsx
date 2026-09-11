'use client'

/**
 * Landing page for the "reset password" email link (self-service forgot-password,
 * as opposed to components/password-gate.tsx which is the admin-forced flow).
 *
 * Supabase's link carries a recovery code/token; the browser client exchanges it
 * for a session as soon as it loads this page (no middleware in this app — same
 * cookie-based session used everywhere else). We just wait for that session to
 * show up, then reuse the same server-enforced "set my password" endpoint the
 * admin-forced gate uses.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { getSupabase } from '@/lib/supabase'

type Status = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()
  const { user, homePath, completeForcedPasswordChange } = useAuth()
  const [status, setStatus] = useState<Status>('checking')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) { setStatus('invalid'); return }

    // Supabase redirects back with ?error=... when the link is expired/used.
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'))
    if (params.get('error')) { setStatus('invalid'); return }

    let settled = false
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (settled) return
      if (event === 'PASSWORD_RECOVERY' || ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session)) {
        settled = true
        setStatus('ready')
      }
    })
    sb.auth.getSession().then(({ data }) => {
      if (!settled && data.session) { settled = true; setStatus('ready') }
    })
    const timeout = setTimeout(() => { if (!settled) setStatus('invalid') }, 5000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => router.replace(homePath ?? '/login'), 1200)
    return () => clearTimeout(t)
  }, [done, homePath, router])

  const tooShort = pw.length < 8
  const mismatch = confirm.length > 0 && confirm !== pw

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tooShort) { setError('Password must be at least 8 characters.'); return }
    if (pw !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError('')
    const res = await completeForcedPasswordChange(pw)
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Could not update password.'); return }
    setDone(true)
  }

  if (status === 'checking') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
        <p className="modal-hint">Verifying your reset link…</p>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
        <div className="modal-card" style={{ width: 'min(420px, 100%)' }}>
          <div className="modal-head"><div><p className="eyebrow">Society Manager</p><h2 style={{ margin: '2px 0 0' }}>Link expired or invalid</h2></div></div>
          <p className="modal-hint" style={{ padding: '14px 24px 0' }}>
            This password reset link is no longer valid. Request a new one from the sign-in screen.
          </p>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => router.replace('/login')}><ArrowLeft data-icon="inline-start" />Back to sign in</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
      <div className="modal-card" style={{ width: 'min(420px, 100%)' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-mark" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary)', color: '#fff' }}><KeyRound size={18} /></div>
            <div><p className="eyebrow" style={{ margin: 0 }}>Society Manager</p><h2 style={{ margin: '2px 0 0' }}>Choose a new password</h2></div>
          </div>
        </div>
        {done ? (
          <p className="modal-hint" style={{ padding: '14px 24px 20px' }}>Password updated{user ? ` for ${user.email}` : ''}. Taking you in…</p>
        ) : (
          <form onSubmit={submit}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>New password<input type="password" autoComplete="new-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} placeholder="min 8 chars" required /></label>
              <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="re-enter password" required /></label>
              {(error || mismatch) && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error || 'Passwords do not match.'}</p>}
            </div>
            <div className="modal-actions">
              <Button type="submit" disabled={busy || tooShort || pw !== confirm}><CheckCircle2 data-icon="inline-start" />{busy ? 'Saving…' : 'Set new password'}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
