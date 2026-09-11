'use client'

import { useState } from 'react'
import { X, KeyRound, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resetClientUserPassword, type ClientUser } from '@/lib/admin'

type Props = {
  societyId: string
  user: ClientUser
  close: () => void
  onSuccess: (msg: string) => void
}

export default function ResetPasswordModal({ societyId, user, close, onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const tooShort = password.length < 8 // same rule as the "Add user" temp-password field

  const submit = async () => {
    if (tooShort) return
    setBusy(true); setError('')
    try {
      await resetClientUserPassword(societyId, user.id, password)
      onSuccess(`Temporary password set for ${user.name || user.email}. They must choose a new one at next login.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the password.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)' }}>
        <div className="modal-head">
          <div><p className="eyebrow">{user.email}</p><h2>Reset password</h2></div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label><span className="label-with-icon"><KeyRound size={14} /> Temporary password</span>
            <input type="text" autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="min 8 chars" />
          </label>
          <p className="modal-hint" style={{ padding: 0 }}>
            The existing password is never shown. {user.name || 'The user'} will be asked to set a new password the next time they sign in.
          </p>
          {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
        </div>
        <div className="modal-actions">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={busy || tooShort}><CheckCircle2 data-icon="inline-start" />{busy ? 'Saving…' : 'Set temporary password'}</Button>
        </div>
      </div>
    </div>
  )
}
