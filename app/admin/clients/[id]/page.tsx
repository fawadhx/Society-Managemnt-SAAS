'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchClient, fetchClientUsers, fetchPlanRequests, fetchClientActivity, updateClient, addClientUser, removeClientUser, setClientUserAccess, resolveRequest,
  type AdminClient, type ClientUser, type PlanRequest, type ActivityEntry,
} from '@/lib/admin'
import { PLANS, DEFAULT_EXTRA_SEAT_PRICE, monthlyRevenue, statusTone, type SocietyDisplayStatus, type SubscriptionTier } from '@/lib/plans'
import { useAuth } from '@/lib/auth-context'

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { viewSociety } = useAuth()
  const [client, setClient] = useState<AdminClient | null>(null)
  const [users, setUsers] = useState<ClientUser[]>([])
  const [requests, setRequests] = useState<PlanRequest[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [activityWho, setActivityWho] = useState('all')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', access: 'editor' })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([fetchClient(id), fetchClientUsers(id), fetchPlanRequests(id), fetchClientActivity(id)]).then(([c, u, r, a]) => {
      setClient(c); setUsers(u); setRequests(r); setActivity(a); setLoading(false)
    })
  }, [id])
  useEffect(load, [load])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  const patch = async (body: Record<string, unknown>, note: string) => {
    try { await updateClient(id, body); flash(note); load() } catch (e) { flash(e instanceof Error ? e.message : 'Failed') }
  }

  if (loading) return <div className="empty-state"><p>Loading…</p></div>
  if (!client) return <div className="empty-state"><h3>Client not found</h3><Link className="linkish" href="/admin">Back to clients</Link></div>

  const s = client.subscription
  const seatsTotal = s.includedSeats + s.extraSeats
  const projectedMrr = (tier: SubscriptionTier, extra: number) => PLANS[tier].price + extra * DEFAULT_EXTRA_SEAT_PRICE

  return (
    <>
      <div className="page-heading">
        <div>
          <Link className="linkish" href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><ArrowLeft size={13} />All clients</Link>
          <h1 style={{ marginTop: 6 }}>{client.name}</h1>
          <p className="muted">/{client.slug} · {client.kind} · <span className={`status ${statusTone(client.displayStatus as SocietyDisplayStatus)}`}><span className="status-dot" />{client.displayStatus}</span></p>
        </div>
        <Button variant="outline" onClick={() => { viewSociety(id); router.push(`/${client.slug}`) }}><ExternalLink data-icon="inline-start" />Open workspace</Button>
      </div>
      {msg && <div className="toast">{msg}</div>}

      <div className="settings-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Subscription</h2><p>MRR {fmt(monthlyRevenue(s))}</p></div></div>
          <div className="settings-section">
            <div className="settings-row"><span className="settings-label">Tier</span>
              <select className="tier-select" value={s.tier} onChange={e => patch({ tier: e.target.value }, 'Tier updated')}>
                <option value="TIER_1">T1 Basic — {fmt(PLANS.TIER_1.price)}</option>
                <option value="TIER_2">T2 Pro — {fmt(PLANS.TIER_2.price)}</option>
                <option value="TIER_3">T3 Enterprise — {fmt(PLANS.TIER_3.price)}</option>
              </select>
            </div>
            <div className="settings-row"><span className="settings-label">Included seats</span><span className="settings-value">{s.includedSeats}</span></div>
            <div className="settings-row"><span className="settings-label">Extra seats (+{fmt(DEFAULT_EXTRA_SEAT_PRICE)}/mo each)</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="action-btn" onClick={() => patch({ extraSeats: Math.max(0, s.extraSeats - 1) }, 'Seat removed')}>−</button>
                <strong>{s.extraSeats}</strong>
                <button className="action-btn" onClick={() => patch({ extraSeats: s.extraSeats + 1 }, 'Seat added')}>+</button>
              </span>
            </div>
            <div className="settings-row"><span className="settings-label">Seats used</span><span className="settings-value">{client.seatsUsed} / {seatsTotal}</span></div>
            <div className="settings-row"><span className="settings-label">Projected MRR</span><span className="settings-value">{fmt(projectedMrr(s.tier, s.extraSeats))}</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Lifecycle</h2><p>Current: {s.status}</p></div></div>
          <div className="settings-section">
            <div className="settings-row"><span className="settings-label">Status</span>
              <select className="tier-select" value={s.status} onChange={e => patch({ subStatus: e.target.value }, 'Status updated')}>
                <option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option>
                <option value="canceled">Canceled</option><option value="expired">Expired</option>
              </select>
            </div>
            <div className="settings-row"><span className="settings-label">Trial ends</span><span className="settings-value">{s.trialEndsAt ? new Date(s.trialEndsAt).toLocaleDateString() : '—'}</span></div>
            <div className="settings-row"><span className="settings-label">Period ends</span><span className="settings-value">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : '—'}</span></div>
            <div className="settings-row"><span className="settings-label">Extend</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="filter-button" onClick={() => patch({ trialDays: 14 }, 'Trial extended 14 days')}>+14d trial</button>
                <button className="filter-button" onClick={() => patch({ extendPeriodDays: 30, subStatus: 'active' }, 'Renewed 30 days')}>Renew 30d</button>
              </span>
            </div>
            <div className="settings-row"><span className="settings-label">Workspace</span>
              {client.status === 'suspended'
                ? <button className="filter-button" onClick={() => patch({ status: 'active' }, 'Reactivated')}>Reactivate</button>
                : <button className="filter-button" onClick={() => patch({ status: 'suspended' }, 'Suspended')} style={{ color: 'var(--danger)' }}>Suspend</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Branding & profile</h2><p>Applied to the client&apos;s workspace</p></div></div>
        <div className="settings-section">
          <div className="settings-row"><span className="settings-label">Name</span><input defaultValue={client.name} onBlur={e => e.target.value !== client.name && patch({ name: e.target.value }, 'Name saved')} className="settings-value" style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }} /></div>
          <div className="settings-row"><span className="settings-label">Kind</span><select className="tier-select" value={client.kind} onChange={e => patch({ kind: e.target.value }, 'Kind saved')}><option value="society">Society</option><option value="plaza">Plaza</option></select></div>
          <div className="settings-row"><span className="settings-label">Logo URL</span><input defaultValue={client.logoUrl ?? ''} onBlur={e => patch({ logoUrl: e.target.value }, 'Logo saved')} className="settings-value" style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }} /></div>
          <div className="settings-row"><span className="settings-label">Brand colour</span><input defaultValue={client.primaryColor ?? ''} placeholder="#117a72" onBlur={e => patch({ primaryColor: e.target.value }, 'Colour saved')} className="settings-value" style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }} /></div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Users &amp; access</h2><p>{users.length} / {seatsTotal} seats — owner / editor / viewer</p></div></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td><td>{u.email}</td>
                <td><select className="tier-select" value={u.access} onChange={e => setClientUserAccess(id, u.id, e.target.value).then(() => { flash('Access updated'); load() }).catch(err => flash(err instanceof Error ? err.message : 'Failed'))}>
                  <option value="owner">Owner</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
                </select></td>
                <td>{u.status}</td><td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>{u.access === 'owner' ? null : <button className="action-btn action-delete" title="Remove" onClick={() => { if (confirm(`Remove ${u.name || u.email}?`)) removeClientUser(id, u.id).then(() => { flash('User removed'); load() }).catch(err => flash(err instanceof Error ? err.message : 'Failed')) }}><Trash2 size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="form-grid" style={{ paddingTop: 12 }}>
          <label>Name<input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} /></label>
          <label>Email<input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></label>
          <label>Temp password<input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="min 8 chars" /></label>
          <label>Access<select value={newUser.access} onChange={e => setNewUser({ ...newUser, access: e.target.value })}>
            <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="owner">Owner</option>
          </select></label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <Button size="sm" disabled={!newUser.email.includes('@') || newUser.password.length < 8 || users.length >= seatsTotal}
              onClick={() => addClientUser(id, newUser).then(() => { flash('User added'); setNewUser({ name: '', email: '', password: '', access: 'editor' }); load() }).catch(e => flash(e instanceof Error ? e.message : 'Failed'))}>
              <UserPlus data-icon="inline-start" />{users.length >= seatsTotal ? 'Seats full' : 'Add user'}
            </Button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div><h2>Activity</h2><p>Every change made in this workspace — last {activity.length}</p></div>
          <select className="tier-select" value={activityWho} onChange={e => setActivityWho(e.target.value)}>
            <option value="all">Everyone</option>
            {[...new Set(activity.map(a => a.performedBy).filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {activity.length === 0
          ? <div className="settings-section"><p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No activity recorded yet.</p></div>
          : <div className="table-scroll"><table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>{activity.filter(a => activityWho === 'all' || a.performedBy === activityWho).slice(0, 100).map(a => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.timestamp).toLocaleString()}</td>
                  <td><strong>{a.performedBy}</strong></td>
                  <td>{a.action.toLowerCase().replace(/_/g, ' ')}</td>
                  <td><code style={{ fontSize: 10 }}>{Object.entries(a.metadata).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') || '—'}</code></td>
                </tr>
              ))}</tbody>
            </table></div>}
      </div>

      {requests.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head"><div><h2>Plan-change requests</h2><p>{requests.length} open</p></div></div>
          <div className="table-scroll"><table>
            <thead><tr><th>Requested</th><th>Kind</th><th>Detail</th><th></th></tr></thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td><td>{r.kind}</td><td>{r.detail}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="filter-button" onClick={() => resolveRequest(r.id, 'done').then(load)}>Mark done</button>
                    <button className="filter-button" onClick={() => resolveRequest(r.id, 'declined').then(load)}>Decline</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  )
}
