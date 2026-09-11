'use client'

import { useMemo, useState } from 'react'
import { Globe, ExternalLink, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSociety } from '@/lib/society-context'
import { EMPTY_SITE, type SiteContent } from '@/lib/site'

const linesToList = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
const listToLines = (a: string[]) => a.join('\n')

export default function WebsiteView({ notify, onNavigate }: {
  notify: (m: string) => void
  onNavigate: (v: 'Leads') => void
}) {
  const { site, sitePublished, saveSite, currentSociety, isReadOnly, units } = useSociety()
  const slug = currentSociety.slug || currentSociety.name.toLowerCase().replace(/\W+/g, '-')

  const [draft, setDraft] = useState<SiteContent>({ ...EMPTY_SITE, ...site })
  const [amenitiesText, setAmenitiesText] = useState(listToLines(site.amenities))
  const [galleryText, setGalleryText] = useState(listToLines(site.gallery))
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/site/${slug}`
    return `${window.location.origin}/site/${slug}`
  }, [slug])

  const vacantCount = units.filter(u => u.occupancy === 'Vacant').length

  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => setDraft(d => ({ ...d, [k]: v }))

  const collect = (): SiteContent => ({
    ...draft,
    amenities: linesToList(amenitiesText),
    gallery: linesToList(galleryText),
  })

  const save = async (publish?: boolean) => {
    setSaving(true)
    const next = collect()
    await saveSite(next, publish ?? sitePublished)
    setSaving(false)
    notify(publish === true ? 'Website published.' : publish === false ? 'Website unpublished.' : 'Website saved.')
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { notify('Could not copy — select the link manually.') }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Public website</h2>
            <p>
              {sitePublished
                ? <>Live at <a className="linkish" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a></>
                : 'Draft — not visible to the public yet'}
            </p>
          </div>
          <div className="list-actions">
            <span className={`status ${sitePublished ? 'status-paid' : 'status-inactive'}`}><span className="status-dot" />{sitePublished ? 'Published' : 'Draft'}</span>
            <button className="filter-button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy link'}</button>
            <a className="filter-button" href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />View site</a>
          </div>
        </div>

        <div className="form-grid">
          <label className="span-2">Headline<input value={draft.headline} onChange={e => set('headline', e.target.value)} placeholder={currentSociety.name} maxLength={120} disabled={isReadOnly} /></label>
          <label className="span-2">Tagline<input value={draft.tagline} onChange={e => set('tagline', e.target.value)} placeholder="A short line under the headline" maxLength={160} disabled={isReadOnly} /></label>
          <label className="span-2">About<textarea value={draft.about} onChange={e => set('about', e.target.value)} rows={4} placeholder="Tell prospects about the community, location, management…" disabled={isReadOnly} /></label>
          <label className="span-2">Amenities <span style={{ fontWeight: 400 }}>(one per line)</span><textarea value={amenitiesText} onChange={e => setAmenitiesText(e.target.value)} rows={4} placeholder={'24/7 security\nBackup power\nMasjid\nPark & play area'} disabled={isReadOnly} /></label>
          <label className="span-2">Hero image URL<input value={draft.heroImageUrl} onChange={e => set('heroImageUrl', e.target.value)} placeholder="https://…" disabled={isReadOnly} /></label>
          <label className="span-2">Gallery image URLs <span style={{ fontWeight: 400 }}>(one per line)</span><textarea value={galleryText} onChange={e => setGalleryText(e.target.value)} rows={3} placeholder={'https://…/photo-1.jpg\nhttps://…/photo-2.jpg'} disabled={isReadOnly} /></label>

          <label>Contact phone<input value={draft.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="0300 1234567" disabled={isReadOnly} /></label>
          <label>Contact email<input value={draft.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="office@example.com" disabled={isReadOnly} /></label>
          <label className="span-2">Contact address<input value={draft.contactAddress} onChange={e => set('contactAddress', e.target.value)} placeholder={currentSociety.address || 'Street, area, city'} disabled={isReadOnly} /></label>
          <label>Accent colour<input type="text" value={draft.accentColor ?? ''} onChange={e => set('accentColor', e.target.value)} placeholder={currentSociety.primaryColor || '#117a72'} disabled={isReadOnly} /></label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <label className="toggle-switch">
              <input type="checkbox" checked={draft.showAvailableUnits} onChange={e => set('showAvailableUnits', e.target.checked)} disabled={isReadOnly} />
              <span className="toggle-slider" />
            </label>
            Show available units ({vacantCount} vacant)
          </label>
        </div>

        <div className="modal-actions" style={{ padding: '4px 24px 20px', justifyContent: 'space-between' }}>
          <Button
            variant={sitePublished ? 'destructive' : 'outline'}
            size="sm"
            disabled={saving || isReadOnly}
            onClick={() => save(!sitePublished)}
          >
            {sitePublished ? <><EyeOff data-icon="inline-start" />Unpublish</> : <><Eye data-icon="inline-start" />Publish</>}
          </Button>
          <Button disabled={saving || isReadOnly} onClick={() => save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </section>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Inquiries</h2><p>Every form submission on this site becomes a lead</p></div>
          <Button variant="outline" size="sm" onClick={() => onNavigate('Leads')}><Globe data-icon="inline-start" />Open Leads →</Button>
        </div>
      </div>
    </>
  )
}
