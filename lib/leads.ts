/**
 * Lead / CRM model — prospective residents or tenants captured from the T3
 * public website (or entered by hand). Leads move through a pipeline and a
 * "won" lead can be converted into a real resident on a unit.
 */

export type LeadStatus = 'new' | 'contacted' | 'viewing' | 'negotiating' | 'won' | 'lost'
export type LeadSource = 'website' | 'manual' | 'referral' | 'walk-in'

export type Lead = {
  id: string
  name: string
  phone: string
  email?: string
  status: LeadStatus
  source: LeadSource
  budget?: number
  /** Unit the prospect is interested in (optional). */
  unitId?: string
  /** Free-text preference, e.g. "2-bed in Block A". */
  unitPref: string
  message: string
  assignedTo?: string
  notes: string
  convertedResidentId?: string
  createdAt: string
  updatedAt: string
}

/** Pipeline order — also the order shown in tables / boards. */
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'viewing', 'negotiating', 'won', 'lost']

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  viewing: 'Viewing',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
}

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: 'Website',
  manual: 'Manual',
  referral: 'Referral',
  'walk-in': 'Walk-in',
}

/** Map a lead status onto the existing `.status-*` chip classes in globals.css. */
export function leadStatusTone(status: LeadStatus): string {
  switch (status) {
    case 'new': return 'status-pending'
    case 'contacted': return 'status-partial'
    case 'viewing': return 'status-partial'
    case 'negotiating': return 'status-partial'
    case 'won': return 'status-paid'
    case 'lost': return 'status-inactive'
  }
}

/** A lead still being worked (not won, not lost). */
export function isActiveLead(l: Lead): boolean {
  return l.status !== 'won' && l.status !== 'lost'
}

/** Won ÷ (won + lost), as a rounded percentage. 0 when nothing is closed yet. */
export function conversionRate(leads: Lead[]): number {
  const won = leads.filter(l => l.status === 'won').length
  const closed = won + leads.filter(l => l.status === 'lost').length
  return closed === 0 ? 0 : Math.round((won / closed) * 100)
}

/** Leads that reached "won" within the last `days` days. */
export function wonWithin(leads: Lead[], days = 30): number {
  const since = Date.now() - days * 86400000
  return leads.filter(l => l.status === 'won' && new Date(l.updatedAt).getTime() >= since).length
}
