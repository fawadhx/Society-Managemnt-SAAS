'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, LogIn, LogOut, Mail, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { signIn, signOut, requestPasswordReset, authReady, user, homePath, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  // Signed in with a real destination → go there. Never bounces back here.
  useEffect(() => {
    if (!authReady || !user) return
    if (homePath && homePath !== pathname) router.replace(homePath)
  }, [authReady, user, homePath, pathname, router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    const res = await signIn(email, password)
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Unable to sign in.')
  }

  const openForgot = () => {
    setResetEmail(email)
    setResetError(''); setResetSent(false)
    setMode('forgot')
  }

  const backToSignIn = () => {
    setMode('signin')
    setResetError(''); setResetSent(false)
  }

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError(''); setResetBusy(true)
    const res = await requestPasswordReset(resetEmail)
    setResetBusy(false)
    // Same confirmation whether or not the address has an account — avoids leaking who's registered.
    if (res.ok) setResetSent(true)
    else setResetError(res.error ?? 'Could not send the reset link.')
  }

  // Logged in but attached to no workspace — dead end, offer sign-out.
  if (authReady && user && homePath === null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
        <div className="modal-card" style={{ width: 'min(400px, 100%)' }}>
          <div className="modal-head"><div><p className="eyebrow">Society Manager</p><h2 style={{ margin: '2px 0 0' }}>No workspace yet</h2></div></div>
          <p className="modal-hint" style={{ padding: '14px 24px 0' }}>
            Your account (<strong>{user.email}</strong>) isn&apos;t attached to any society or plaza. Ask your provider to add you to one.
          </p>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => signOut().then(() => router.replace('/login'))}><LogOut data-icon="inline-start" />Sign out</Button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'forgot') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
        <div className="modal-card" style={{ width: 'min(400px, 100%)' }}>
          <div className="modal-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="brand-mark" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary)', color: '#fff' }}><Mail size={18} /></div>
              <div><p className="eyebrow" style={{ margin: 0 }}>Society Manager</p><h2 style={{ margin: '2px 0 0' }}>Reset your password</h2></div>
            </div>
          </div>
          {resetSent ? (
            <>
              <p className="modal-hint" style={{ padding: '14px 24px 0' }}>
                If an account exists for <strong>{resetEmail}</strong>, we&apos;ve emailed a link to reset the password. It expires soon, so use it shortly.
              </p>
              <div className="modal-actions">
                <Button type="button" variant="outline" onClick={backToSignIn}><ArrowLeft data-icon="inline-start" />Back to sign in</Button>
              </div>
            </>
          ) : (
            <form onSubmit={submitForgot}>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Email<input type="email" autoComplete="username" autoFocus value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="you@example.com" required /></label>
                {resetError && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{resetError}</p>}
              </div>
              <div className="modal-actions">
                <Button type="button" variant="outline" onClick={backToSignIn}><ArrowLeft data-icon="inline-start" />Back to sign in</Button>
                <Button type="submit" disabled={resetBusy || !configured}><Mail data-icon="inline-start" />{resetBusy ? 'Sending…' : 'Send reset link'}</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20, background: 'var(--background)' }}>
      <div className="modal-card" style={{ width: 'min(400px, 100%)' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-mark" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--primary)', color: '#fff' }}><Building2 size={19} /></div>
            <div><p className="eyebrow" style={{ margin: 0 }}>Society Manager</p><h2 style={{ margin: '2px 0 0' }}>Sign in</h2></div>
          </div>
        </div>
        {!configured && <p className="modal-hint" style={{ padding: '14px 24px 0', color: 'var(--danger)' }}>Supabase is not configured on this deployment. Set the environment variables to enable sign in.</p>}
        <form onSubmit={submit}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
            <label>
              Password
              <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </label>
            <button
              type="button"
              onClick={openForgot}
              style={{ justifySelf: 'end', background: 'none', border: 'none', padding: 0, margin: '-6px 0 0', font: 'inherit', fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }}
            >
              Forgot password?
            </button>
            {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
          </div>
          <div className="modal-actions">
            <Button type="submit" disabled={busy || !configured}><LogIn data-icon="inline-start" />{busy ? 'Signing in…' : 'Sign in'}</Button>
          </div>
        </form>
        <p className="modal-hint" style={{ padding: '0 24px 20px' }}>Accounts are provisioned by your provider. Contact them if you need access.</p>
      </div>
    </div>
  )
}
