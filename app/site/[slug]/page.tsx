import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicSite } from '@/lib/site-server'
import LeadForm from './lead-form'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK')}`

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const site = await getPublicSite(slug)
  if (!site) return { title: 'Site unavailable' }
  const title = site.content.headline || site.society.name
  const description = site.content.tagline || site.society.address || `${site.society.name} — official website`
  return { title, description, openGraph: { title, description } }
}

export default async function SitePage({ params }: Props) {
  const { slug } = await params
  const site = await getPublicSite(slug)
  if (!site) notFound()

  const { society, content, units } = site
  const accent = content.accentColor || society.primaryColor || undefined
  const orgWord = society.kind === 'plaza' ? 'plaza' : 'society'
  const headline = content.headline || society.name
  const style = accent ? ({ ['--primary' as string]: accent } as React.CSSProperties) : undefined

  return (
    <div className="site-page" style={style}>
      <header className="site-hero" style={content.heroImageUrl ? { backgroundImage: `linear-gradient(rgba(10,20,25,.55), rgba(10,20,25,.75)), url(${JSON.stringify(content.heroImageUrl)})` } : undefined}>
        <div className="site-hero-inner">
          {society.logoUrl && <img className="site-logo" src={society.logoUrl} alt="" />}
          <h1>{headline}</h1>
          {content.tagline && <p>{content.tagline}</p>}
          <a className="site-hero-cta" href="#inquire">Inquire about a unit</a>
        </div>
      </header>

      <main className="site-main">
        {content.about && (
          <section className="site-section">
            <h2>About {society.name}</h2>
            <p className="site-about">{content.about}</p>
          </section>
        )}

        {content.amenities.length > 0 && (
          <section className="site-section">
            <h2>Amenities</h2>
            <ul className="site-amenities">
              {content.amenities.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </section>
        )}

        {content.showAvailableUnits && units.length > 0 && (
          <section className="site-section">
            <h2>Available units</h2>
            <div className="site-units">
              {units.map(u => (
                <div className="site-unit" key={u.unitNumber}>
                  <strong>{u.unitNumber}</strong>
                  <span>{u.type}{u.block ? ` · Block ${u.block}` : ''}</span>
                  {u.monthlyCharge > 0 && <span className="site-unit-price">{fmt(u.monthlyCharge)}/mo</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {content.gallery.length > 0 && (
          <section className="site-section">
            <h2>Gallery</h2>
            <div className="site-gallery">
              {content.gallery.map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
            </div>
          </section>
        )}

        <section className="site-section site-contact" id="inquire">
          <div className="site-contact-info">
            <h2>Get in touch</h2>
            {content.contactAddress && <p>{content.contactAddress}</p>}
            {!content.contactAddress && society.address && <p>{society.address}</p>}
            {content.contactPhone && <p><a href={`tel:${content.contactPhone.replace(/[^0-9+]/g, '')}`}>{content.contactPhone}</a></p>}
            {content.contactEmail && <p><a href={`mailto:${content.contactEmail}`}>{content.contactEmail}</a></p>}
          </div>
          <div className="site-form-wrap">
            <LeadForm slug={society.slug} org={orgWord} />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>{society.name}</span>
        <span>Powered by Society Manager</span>
      </footer>
    </div>
  )
}
