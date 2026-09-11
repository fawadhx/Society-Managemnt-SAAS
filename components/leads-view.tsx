'use client'

import { useMemo, useState } from 'react'
import { Plus, Download, X, Eye, ArrowRightCircle, Sparkles, Users, TrendingUp, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety, type Lead } from '@/lib/society-context'
import {
  LEAD_STATUSES, LEAD_STATUS_LABEL, LEAD_SOURCE_LABEL, leadStatusTone,
  isActiveLead, conversionRate, wonWithin,
} from '@/lib/leads'
import { toCsv, downloadCsv } from '@/lib/csv'
import LeadDetailModal from '@/components/lead-detail-modal'

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

function Kpi({ title, value, sub, icon: Icon, color }: { title: string; value: string; sub: string; icon: typeof Users; color: string }) {
  return (
    <div className="kpi">
      <div className={`kpi-icon ${color}`}><Icon size={17} /></div>
      <p>{title}</p>
      <strong>{value}</strong>
      <div className="change"><em>{sub}</em></div>
    </div>
  )
}

function AddLeadModal({ close, notify }: { close: () => void; notify: (m: string) => void }) {
  const { units, addLead } = useSociety()
  const [form, setForm] = useState({ name: '', phone: '', email: '', unitPref: '', budget: '', message: '', unitId: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) return
    await addLead({
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      unitPref: form.unitPref.trim() || undefined,
      budget: form.budget.trim() === '' ? undefined : Number(form.budget) || 0,
      message: form.message.trim() || undefined,
      unitId: form.unitId || undefined,
    })
    notify('Lead added.')
    close()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card">
      <div className="modal-head"><div><p className="eyebrow">New lead</p><h2>Add a lead</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
      <div className="form-grid">
        <label>Name<input value={form.name} onChange={set('name')} placeholder="e.g. Bilal Ahmed" /></label>
        <label>Phone<input value={form.phone} onChange={set('phone')} placeholder="e.g. 0300 1234567" /></label>
        <label>Email<input value={form.email} onChange={set('email')} placeholder="Optional" /></label>
        <label>Budget — PKR<input type="number" min={0} value={form.budget} onChange={set('budget')} placeholder="Optional" /></label>
        <label className="span-2">Interested in<input value={form.unitPref} onChange={set('unitPref')} placeholder="e.g. 2-bed in Block A" /></label>
        <label className="span-2">Unit of interest
          <select value={form.unitId} onChange={set('unitId')}>
            <option value="">— none —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber}{u.block ? ` — Block ${u.block}` : ''} · {fmt(u.monthlyCharge)}/mo · {u.occupancy}</option>)}
          </select>
        </label>
        <label className="span-2">Notes<textarea value={form.message} onChange={set('message')} rows={3} placeholder="Where did they come from? What do they want?" /></label>
      </div>
      <div className="modal-actions">
        <Button variant="outline" onClick={close}>Cancel</Button>
        <Button onClick={submit} disabled={!form.name.trim()}><CheckCircle2 data-icon="inline-start" />Add lead</Button>
      </div>
    </div></div>
  )
}

export default function LeadsView({ query, notify, onConvert, onNavigate }: {
  query: string
  notify: (m: string) => void
  onConvert: (lead: Lead) => void
  onNavigate: (v: 'Website') => void
}) {
  const { leads, updateLead, isReadOnly, currentSociety, sitePublished } = useSociety()
  const [adding, setAdding] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active'>('active')

  const slug = currentSociety.slug || currentSociety.name.toLowerCase().replace(/\W+/g, '-')
  const detailLead = leads.find(l => l.id === detailId) ?? null

  const q = query.trim().toLowerCase()
  const rows = useMemo(() => leads.filter(l => {
    if (statusFilter === 'active' && !isActiveLead(l)) return false
    if (!q) return true
    return [l.name, l.phone, l.email, l.unitPref, LEAD_STATUS_LABEL[l.status]].join(' ').toLowerCase().includes(q)
  }), [leads, statusFilter, q])

  const stats = useMemo(() => ({
    newCount: leads.filter(l => l.status === 'new').length,
    active: leads.filter(isActiveLead).length,
    won30: wonWithin(leads, 30),
    conv: conversionRate(leads),
  }), [leads])

  const exportCsv = () => {
    downloadCsv(`${slug}-leads`, toCsv(
      ['Name', 'Phone', 'Email', 'Interested in', 'Stage', 'Source', 'Budget (PKR)', 'Created'],
      leads.map(l => [l.name, l.phone, l.email ?? '', l.unitPref, LEAD_STATUS_LABEL[l.status], LEAD_SOURCE_LABEL[l.source], l.budget ?? '', new Date(l.createdAt).toLocaleDateString()]),
    ))
    notify('Leads exported.')
  }

  return (
    <>
      {!sitePublished && (
        <div className="upgrade-banner" style={{ marginBottom: 14, gridColumn: 'auto' }}>
          <Sparkles size={20} />
          <p>Your public website isn&apos;t published yet, so the inquiry form isn&apos;t live. <button className="linkish" onClick={() => onNavigate('Website')}>Set up your website →</button></p>
        </div>
      )}

      <div className="sub-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Kpi title="New" value={String(stats.newCount)} sub="not yet contacted" icon={Sparkles} color="amber" />
        <Kpi title="In pipeline" value={String(stats.active)} sub="being worked" icon={Users} color="blue" />
        <Kpi title="Won (30d)" value={String(stats.won30)} sub="converted this month" icon={CheckCircle2} color="teal" />
        <Kpi title="Conversion" value={`${stats.conv}%`} sub="won of all closed" icon={TrendingUp} color="teal" />
      </div>

      <section className="panel list-panel">
        <div className="panel-head">
          <div><h2>Leads</h2><p>{rows.length} {statusFilter === 'active' ? 'in pipeline' : 'total'}{q ? ` · “${query}”` : ''}</p></div>
          <div className="list-actions">
            <div className="toggle">
              <button className={statusFilter === 'active' ? 'selected' : ''} onClick={() => setStatusFilter('active')}>Pipeline</button>
              <button className={statusFilter === 'all' ? 'selected' : ''} onClick={() => setStatusFilter('all')}>All</button>
            </div>
            <button className="filter-button" onClick={exportCsv}><Download size={15} />Export</button>
            <Button size="sm" onClick={() => setAdding(true)} disabled={isReadOnly}><Plus data-icon="inline-start" />Add lead</Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <Sparkles size={40} strokeWidth={1.5} color="var(--muted-foreground)" />
            <h3>{leads.length === 0 ? 'No leads yet' : 'Nothing here'}</h3>
            <p>{leads.length === 0 ? 'Inquiries from your public website land here automatically. You can also add leads by hand.' : 'Try switching to “All” or clearing the search.'}</p>
          </div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Name</th><th>Contact</th><th>Interested in</th><th>Stage</th><th>Source</th><th>Added</th><th>Actions</th></tr></thead>
            <tbody>{rows.map(l => (
              <tr key={l.id}>
                <td><strong>{l.name}</strong></td>
                <td>{l.phone || l.email || '—'}</td>
                <td>{l.unitPref || '—'}</td>
                <td>
                  <select className="tier-select" value={l.status} disabled={isReadOnly}
                    onChange={e => { void updateLead(l.id, { status: e.target.value as Lead['status'] }); notify('Stage updated.') }}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
                <td><span className={`status ${leadStatusTone(l.status)}`}><span className="status-dot" />{LEAD_SOURCE_LABEL[l.source]}</span></td>
                <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                <td className="row-actions">
                  <button className="action-btn action-view" title="Open lead" onClick={() => setDetailId(l.id)}><Eye size={13} /></button>
                  {l.status !== 'won' && <button className="action-btn action-pay" title="Convert to resident" onClick={() => onConvert(l)} disabled={isReadOnly}><ArrowRightCircle size={13} /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {adding && <AddLeadModal close={() => setAdding(false)} notify={notify} />}
      {detailLead && <LeadDetailModal lead={detailLead} close={() => setDetailId(null)} notify={notify} onConvert={onConvert} />}
    </>
  )
}
