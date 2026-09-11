/**
 * Public website (CMS) content for a T3 society/plaza. One editable document per
 * society, stored as `society_sites.content` (jsonb). The site renders at
 * /site/<slug> and its contact form feeds the CRM (`leads` table).
 */

export type SiteContent = {
  headline: string
  tagline: string
  about: string
  amenities: string[]
  gallery: string[]
  heroImageUrl: string
  contactPhone: string
  contactEmail: string
  contactAddress: string
  /** Show vacant units (number, block, type, charge) on the public page. */
  showAvailableUnits: boolean
  /** Overrides the society's primary_color for the public site only. */
  accentColor?: string
}

export const EMPTY_SITE: SiteContent = {
  headline: '',
  tagline: '',
  about: '',
  amenities: [],
  gallery: [],
  heroImageUrl: '',
  contactPhone: '',
  contactEmail: '',
  contactAddress: '',
  showAvailableUnits: true,
  accentColor: '',
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

/** Coerce an arbitrary jsonb blob into a well-formed SiteContent. */
export function normalizeSite(raw: unknown): SiteContent {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    headline: str(r.headline),
    tagline: str(r.tagline),
    about: str(r.about),
    amenities: list(r.amenities),
    gallery: list(r.gallery),
    heroImageUrl: str(r.heroImageUrl),
    contactPhone: str(r.contactPhone),
    contactEmail: str(r.contactEmail),
    contactAddress: str(r.contactAddress),
    showAvailableUnits: r.showAvailableUnits !== false,
    accentColor: str(r.accentColor),
  }
}
