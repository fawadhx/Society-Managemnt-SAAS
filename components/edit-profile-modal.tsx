'use client'

import { useState } from 'react'
import { X, User, Mail, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'

type Props = {
  close: () => void
  onSuccess: (msg: string) => void
}

export default function EditProfileModal({ close, onSuccess }: Props) {
  const { user, isSuperAdmin, updateProfile, changePassword } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSave = async () => {
    setBusy(true); setError('')
    if (name.trim() && name.trim() !== user?.name) {
      const r = await updateProfile({ name: name.trim() })
      if (!r.ok) { setError(r.error ?? 'Could not update name.'); setBusy(false); return }
    }
    if (password) {
      const r = await changePassword(password)
      if (!r.ok) { setError(r.error ?? 'Could not update password.'); setBusy(false); return }
    }
    setBusy(false)
    onSuccess('Profile updated.')
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><p className="eyebrow">Account</p><h2>Edit profile</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
        <div className="profile-modal-avatar"><div className="avatar avatar-lg">{(name || '?').split(' ').map(n => n[0]).join('').toUpperCase()}</div></div>
        <div className="form-grid">
          <label className="span-2"><span className="label-with-icon"><User size={14} /> Name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="span-2"><span className="label-with-icon"><Mail size={14} /> Email</span><input value={user?.email ?? ''} disabled className="input-disabled" /></label>
          <label className="span-2"><span className="label-with-icon"><ShieldCheck size={14} /> Role</span><input value={isSuperAdmin ? 'Super Admin' : 'Administrator'} disabled className="input-disabled" /></label>
          <label className="span-2"><span className="label-with-icon"><Lock size={14} /> New password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current (min 8 chars)" /></label>
        </div>
        {error && <p style={{ padding: '0 24px', margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
        <div className="modal-actions">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}><CheckCircle2 data-icon="inline-start" />{busy ? 'Saving…' : 'Save profile'}</Button>
        </div>
      </div>
    </div>
  )
}
