'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function LeadForm({ slug, org }: { slug: string; org: string }) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', unitPref: '', message: '', website: '' })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending'); setError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, ...form }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong. Please try again.')
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="site-form-done">
        <h3>Thank you!</h3>
        <p>Your inquiry has reached the {org} team. Someone will be in touch shortly.</p>
      </div>
    )
  }

  return (
    <form className="site-form" onSubmit={submit}>
      <label>
        Full name
        <input value={form.name} onChange={set('name')} required maxLength={120} autoComplete="name" />
      </label>
      <div className="site-form-row">
        <label>
          Phone
          <input value={form.phone} onChange={set('phone')} type="tel" maxLength={40} autoComplete="tel" />
        </label>
        <label>
          Email
          <input value={form.email} onChange={set('email')} type="email" maxLength={160} autoComplete="email" />
        </label>
      </div>
      <label>
        What are you looking for?
        <input value={form.unitPref} onChange={set('unitPref')} maxLength={200} placeholder="e.g. 2-bed apartment in Block A" />
      </label>
      <label>
        Message
        <textarea value={form.message} onChange={set('message')} maxLength={2000} rows={4} />
      </label>
      {/* Honeypot — hidden from real users. */}
      <input
        className="site-hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={form.website}
        onChange={set('website')}
      />
      {status === 'error' && <p className="site-form-error">{error}</p>}
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send inquiry'}
      </button>
    </form>
  )
}
