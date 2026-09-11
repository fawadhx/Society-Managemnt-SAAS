'use client'

/**
 * Forced-password-change gate.
 *
 * Rendered once at the app root. Whenever the signed-in user carries
 * `mustChangePassword` (an admin ran "Reset password" for them), this replaces
 * the entire app with a "set a new password" screen until they choose one.
 * Being a single early-return chokepoint, no route can slip past it.
 */

import { useState } from 'react'
import { KeyRound, LogOut, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const { authReady, user, completeForcedPasswordChange, signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!authReady || !user || !user.mustChangePassword) return <>{children}</>

  const tooShort = pw.length < 8
  const mismatch = confirm.length > 0 && confirm !== pw

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tooShort) { setError('Password must be at least 8 characters.'); return }
    if (pw !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError('')
    const r = await completeForcedPasswordChange(pw)
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Could not update password.')
    // On success the flag flips false and this component unmounts itself.
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
      <div className="modal-card" style={{ width: 'min(420px, 100%)' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-mark" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary)', color: '#fff' }}><KeyRound size={18} /></div>
            <div><p className="eyebrow" style={{ margin: 0 }}>Security</p><h2 style={{ margin: '2px 0 0' }}>Set a new password</h2></div>
          </div>
        </div>
        <p className="modal-hint" style={{ padding: '14px 24px 0' }}>
          An administrator reset the password for <strong>{user.email}</strong>. Choose a new one to continue into the app.
        </p>
        <form onSubmit={submit}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>New password<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="min 8 chars" required /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="re-enter password" required /></label>
            {(error || mismatch) && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error || 'Passwords do not match.'}</p>}
          </div>
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={() => void signOut()}><LogOut data-icon="inline-start" />Sign out</Button>
            <Button type="submit" disabled={busy || tooShort || pw !== confirm}><CheckCircle2 data-icon="inline-start" />{busy ? 'Saving…' : 'Set password & continue'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
