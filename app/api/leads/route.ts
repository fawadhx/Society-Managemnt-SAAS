import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-server'
import { getPublicSite } from '@/lib/site-server'

/**
 * Public lead-capture endpoint for the T3 marketing site (/site/<slug>).
 * Anonymous — protected by a honeypot field and a best-effort per-IP throttle.
 * Writes with the service-role client; the `leads` table is not anon-writable.
 */

const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 5
const hits = new Map<string, number[]>()

function throttled(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear() // crude memory cap
  return recent.length > MAX_PER_WINDOW
}

const clamp = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  // Honeypot — a real browser leaves this empty. Pretend success, drop silently.
  if (clamp(body.website, 200) !== '') return NextResponse.json({ ok: true })

  const slug = clamp(body.slug, 60).toLowerCase()
  const name = clamp(body.name, 120)
  const phone = clamp(body.phone, 40)
  const email = clamp(body.email, 160)
  const unitPref = clamp(body.unitPref, 200)
  const message = clamp(body.message, 2000)

  if (!slug) return NextResponse.json({ error: 'Missing site.' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!phone && !email) return NextResponse.json({ error: 'Add a phone number or an email so we can reach you.' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  if (throttled(ip)) return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Lead capture is not configured.' }, { status: 500 })

  // Only accept leads for an active, published, T3 site.
  const target = await getPublicSite(slug)
  if (!target) return NextResponse.json({ error: 'This site is not accepting inquiries.' }, { status: 404 })

  const { error } = await admin.from('leads').insert({
    society_id: target.society.id,
    name, phone, email: email || null,
    status: 'new', source: 'website',
    unit_pref: unitPref, message,
  })
  if (error) return NextResponse.json({ error: 'Could not submit right now. Please try again.' }, { status: 500 })

  await admin.from('audit_logs').insert({
    society_id: target.society.id, action: 'LEAD_CAPTURED', performed_by: 'website',
    metadata: { name, via: 'public_site' },
  }).then(undefined, () => {})

  return NextResponse.json({ ok: true })
}
