'use client'

import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Member = { id: string; name: string; email: string; status: string; createdAt: string; access: 'owner' | 'editor' | 'viewer'; role: string }

const ACCESS_LABEL: Record<Member['access'], string> = {
  owner: 'Owner — full access + team',
  editor: 'Editor — can change data',
  viewer: 'Viewer — read only',
}

async function api(method: string, body: unknown, qs = '') {
  const res = await fetch(`/api/team${qs}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json
}

export default function TeamPanel({ societyId, seatsUsed, seatsTotal, myUserId, notify }: {
  societyId: string; seatsUsed: number; seatsTotal: number; myUserId?: string; notify: (m: string) => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', access: 'viewer' as Member['access'] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api('GET', null, `?societyId=${societyId}`).then(r => setMembers(r.members ?? [])).catch(() => setMembers([])).finally(() => setLoading(false))
  }, [societyId])
  useEffect(load, [load])

  const atCap = members.length >= seatsTotal
  const add = async () => {
    setBusy(true); setError('')
    try {
      await api('POST', { societyId, ...form })
      setForm({ name: '', email: '', password: '', access: 'viewer' })
      notify(`${form.email} added to the team.`)
      load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }
  const setAccess = async (userId: string, access: Member['access']) => {
    try { await api('PATCH', { societyId, userId, access }); notify('Access updated.'); load() }
    catch (e) { notify(e instanceof Error ? e.message : 'Failed') }
  }
  const remove = async (m: Member) => {
    if (!confirm(`Remove ${m.name || m.email} from the team? They lose access immediately.`)) return
    try { await api('DELETE', { societyId, userId: m.id }); notify('Team member removed.'); load() }
    catch (e) { notify(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panel-head"><div><h2>Team &amp; access</h2><p>{seatsUsed} / {seatsTotal} seats used — control who can view or edit this workspace</p></div></div>
      {loading ? <div className="settings-section"><p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Loading…</p></div> : (
        <div className="table-scroll"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Added</th><th></th></tr></thead>
          <tbody>{members.map(m => (
            <tr key={m.id}>
              <td><strong>{m.name || '—'}</strong>{m.id === myUserId ? <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}> (you)</span> : null}</td>
              <td>{m.email}</td>
              <td>
                <select className="tier-select" value={m.access} disabled={m.id === myUserId} onChange={e => setAccess(m.id, e.target.value as Member['access'])}>
                  <option value="owner">{ACCESS_LABEL.owner}</option>
                  <option value="editor">{ACCESS_LABEL.editor}</option>
                  <option value="viewer">{ACCESS_LABEL.viewer}</option>
                </select>
              </td>
              <td>{new Date(m.createdAt).toLocaleDateString()}</td>
              <td>{m.id === myUserId || m.access === 'owner' ? null : <button className="action-btn action-delete" title="Remove" onClick={() => remove(m)}><Trash2 size={13} /></button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      <div className="form-grid" style={{ paddingTop: 12 }}>
        <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Accountant" /></label>
        <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="person@email.com" /></label>
        <label>Temp password<input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="min 8 characters" /></label>
        <label>Access<select value={form.access} onChange={e => setForm({ ...form, access: e.target.value as Member['access'] })}>
          <option value="viewer">Viewer — read only</option>
          <option value="editor">Editor — can change data</option>
          <option value="owner">Owner — full access + team</option>
        </select></label>
      </div>
      {error && <p style={{ padding: '0 24px', margin: 0, fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
      <div className="modal-actions" style={{ padding: '4px 24px 18px' }}>
        <Button size="sm" disabled={busy || atCap || !form.email.includes('@') || form.password.length < 8} onClick={add}>
          <UserPlus data-icon="inline-start" />{atCap ? 'Seat limit reached' : busy ? 'Adding…' : 'Add member'}
        </Button>
      </div>
      {atCap && <p className="modal-hint" style={{ padding: '0 24px 16px' }}>All {seatsTotal} seats are in use. Use &quot;Request more seats&quot; below to ask your provider for extra seats.</p>}
    </div>
  )
}
