/**
 * Server-only loader for the public marketing site at /site/<slug>.
 *
 * Reads via the service-role client (bypasses RLS) so the public page never
 * needs the anon key and no existing table's RLS has to be widened. Returns
 * null unless the society is active, has a PUBLISHED site, and is on TIER_3.
 */

import { cache } from 'react'
import { getAdminClient } from './supabase-server'
import { normalizeSite, type SiteContent } from './site'

export type PublicUnit = {
  unitNumber: string
  block: string
  type: string
  monthlyCharge: number
}

export type PublicSite = {
  society: {
    id: string
    name: string
    slug: string
    kind: 'society' | 'plaza'
    address: string
    logoUrl?: string
    primaryColor?: string
  }
  content: SiteContent
  units: PublicUnit[]
}

export const getPublicSite = cache(async (slug: string): Promise<PublicSite | null> => {
  const admin = getAdminClient()
  if (!admin || !slug) return null

  const { data: society } = await admin
    .from('societies')
    .select('id, name, slug, kind, address, logo_url, primary_color, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!society || society.status === 'suspended') return null

  const [{ data: site }, { data: sub }] = await Promise.all([
    admin.from('society_sites').select('published, content').eq('society_id', society.id).maybeSingle(),
    admin.from('subscriptions').select('tier').eq('society_id', society.id).maybeSingle(),
  ])
  if (!site?.published) return null
  if (sub?.tier !== 'TIER_3') return null

  const content = normalizeSite(site.content)

  let units: PublicUnit[] = []
  if (content.showAvailableUnits) {
    const { data: unitRows } = await admin
      .from('units')
      .select('unit_number, block, type, monthly_charge')
      .eq('society_id', society.id)
      .eq('status', 'Vacant')
      .order('unit_number')
    units = (unitRows ?? []).map(u => ({
      unitNumber: u.unit_number as string,
      block: (u.block as string) ?? '',
      type: (u.type as string) ?? 'Apartment',
      monthlyCharge: Number(u.monthly_charge ?? 0),
    }))
  }

  return {
    society: {
      id: society.id as string,
      name: society.name as string,
      slug: society.slug as string,
      kind: (society.kind as 'society' | 'plaza') ?? 'society',
      address: (society.address as string) ?? '',
      logoUrl: (society.logo_url as string) ?? undefined,
      primaryColor: (society.primary_color as string) ?? undefined,
    },
    content,
    units,
  }
})
