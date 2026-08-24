'use client'

import { useState } from 'react'
import { X, User, Mail, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  close: () => void
  onSuccess: (msg: string) => void
  initialName: string
  onSaveName: (name: string) => void
}

export default function EditProfileModal({ close, onSuccess, initialName, onSaveName }: Props) {
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('admin@greenvalley.com')
  const [password, setPassword] = useState('')

  const handleSave = () => {
    onSaveName(name)
    onSuccess('Profile updated successfully.')
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Account</p>
            <h2>Edit Profile</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="profile-modal-avatar">
          <div className="avatar avatar-lg">{name.split(' ').map(n => n[0]).join('').toUpperCase()}</div>
        </div>

        <div className="form-grid">
          <label>
            <span className="label-with-icon"><User size={14} /> Admin Name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Arham Raza" />
          </label>
          <label>
            <span className="label-with-icon"><Mail size={14} /> Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@greenvalley.com" />
          </label>
          <label className="span-2">
            <span className="label-with-icon"><ShieldCheck size={14} /> Role</span>
            <input value="Administrator" disabled className="input-disabled" />
          </label>
          <label className="span-2">
            <span className="label-with-icon"><Lock size={14} /> Reset Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter new password (leave blank to keep current)" />
          </label>
        </div>

        <div className="modal-actions">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={handleSave}><CheckCircle2 data-icon="inline-start" />Save Profile</Button>
        </div>
      </div>
    </div>
  )
}
