'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchClients, type AdminClient } from '@/lib/admin'
import { statusTone, type SocietyDisplayStatus } from '@/lib/plans'
import CreateClientModal from '@/components/create-client-modal'

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

export default function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClient[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = () => { setLoading(true); fetchClients().then(c => { setClients(c); setLoading(false) }) }
  useEffect(load, [])

  const rows = useMemo(() => clients.filter(c =>
    (!q || `${c.name} ${c.slug} ${c.address}`.toLowerCase().includes(q.toLowerCase())) &&
    (!tierFilter || c.subscription.tier === tierFilter) &&
    (!statusFilter || c.displayStatus === statusFilter),
  ), [clients, q, tierFilter, statusFilter])

  const totalMrr = clients.filter(c => c.displayStatus === 'Active').reduce((s, c) => s + c.mrr, 0)

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Platform Admin</p><h1>Clients</h1><p className="muted">Every society & plaza on the platform.</p></div>
        <Button onClick={() => setShowCreate(true)}><Plus data-icon="inline-start" />New client</Button>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><p>Total clients</p><strong>{clients.length}</strong></div>
        <div className="kpi"><p>Active</p><strong>{clients.filter(c => c.displayStatus === 'Active').length}</strong></div>
        <div className="kpi"><p>On trial</p><strong>{clients.filter(c => c.displayStatus === 'Trial').length}</strong></div>
        <div className="kpi"><p>MRR (active)</p><strong>{fmt(totalMrr)}</strong></div>
      </div>

      <section className="panel list-panel">
        <div className="panel-head">
          <div><h2>All clients</h2><p>{rows.length} shown</p></div>
          <div className="list-actions">
            <div className="search" style={{ width: 200 }}><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" /></div>
            <select className="tier-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}><option value="">All tiers</option><option value="TIER_1">T1</option><option value="TIER_2">T2</option><option value="TIER_3">T3</option></select>
            <select className="tier-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All status</option><option>Active</option><option>Trial</option><option>Past Due</option><option>Expired</option><option>Suspended</option><option>Cancelled</option></select>
          </div>
        </div>
        {loading ? <div className="empty-state"><p>Loading…</p></div> : rows.length === 0 ? (
          <div className="empty-state"><h3>No clients</h3><p>Create the first client to get started.</p></div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Client</th><th>Kind</th><th>Tier</th><th>Status</th><th>Seats</th><th>MRR</th><th>Units</th><th>Residents</th><th></th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong><br /><span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>/{c.slug}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{c.kind}</td>
                  <td>{c.subscription.tier.replace('TIER_', 'T')}</td>
                  <td><span className={`status ${statusTone(c.displayStatus as SocietyDisplayStatus)}`}><span className="status-dot" />{c.displayStatus}</span></td>
                  <td>{c.seatsUsed}/{c.subscription.includedSeats + c.subscription.extraSeats}</td>
                  <td><strong>{fmt(c.mrr)}</strong></td>
                  <td>{c.unitCount}</td>
                  <td>{c.residentCount}</td>
                  <td><Link className="linkish" href={`/admin/clients/${c.id}`}>Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {showCreate && <CreateClientModal close={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </>
  )
}
