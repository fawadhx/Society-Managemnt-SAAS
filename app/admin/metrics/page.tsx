'use client'

import { useEffect, useState } from 'react'
import { fetchClients, type AdminClient } from '@/lib/admin'
import { PLANS } from '@/lib/plans'

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

export default function MetricsPage() {
  const [clients, setClients] = useState<AdminClient[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetchClients().then(c => { setClients(c); setLoading(false) }) }, [])

  if (loading) return <div className="empty-state"><p>Loading…</p></div>

  const active = clients.filter(c => c.displayStatus === 'Active')
  const trials = clients.filter(c => c.displayStatus === 'Trial')
  const churned = clients.filter(c => ['Cancelled', 'Expired'].includes(c.displayStatus))
  const mrr = active.reduce((s, c) => s + c.mrr, 0)
  const seatsSold = active.reduce((s, c) => s + c.subscription.extraSeats, 0)
  const byTier = (['TIER_1', 'TIER_2', 'TIER_3'] as const).map(t => ({
    tier: t, label: PLANS[t].label,
    count: active.filter(c => c.subscription.tier === t).length,
    mrr: active.filter(c => c.subscription.tier === t).reduce((s, c) => s + c.mrr, 0),
  }))

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Platform Admin</p><h1>Metrics</h1><p className="muted">Snapshot of platform revenue and clients.</p></div></div>
      <div className="kpi-grid">
        <div className="kpi"><p>Total MRR</p><strong>{fmt(mrr)}</strong></div>
        <div className="kpi"><p>Active clients</p><strong>{active.length}</strong></div>
        <div className="kpi"><p>On trial</p><strong>{trials.length}</strong></div>
        <div className="kpi"><p>Churned</p><strong>{churned.length}</strong></div>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><p>Extra seats sold</p><strong>{seatsSold}</strong></div>
        <div className="kpi"><p>Avg MRR / active</p><strong>{fmt(active.length ? Math.round(mrr / active.length) : 0)}</strong></div>
        <div className="kpi"><p>Total units managed</p><strong>{clients.reduce((s, c) => s + c.unitCount, 0)}</strong></div>
        <div className="kpi"><p>Total residents</p><strong>{clients.reduce((s, c) => s + c.residentCount, 0)}</strong></div>
      </div>
      <section className="panel">
        <div className="panel-head"><div><h2>MRR by tier</h2><p>Active subscriptions only</p></div></div>
        <div className="table-scroll"><table>
          <thead><tr><th>Tier</th><th>Active clients</th><th>MRR</th></tr></thead>
          <tbody>{byTier.map(r => <tr key={r.tier}><td><strong>{r.label}</strong></td><td>{r.count}</td><td><strong>{fmt(r.mrr)}</strong></td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  )
}
