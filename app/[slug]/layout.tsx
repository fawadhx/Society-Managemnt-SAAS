'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getSupabase } from '@/lib/supabase'
import { useSociety } from '@/lib/society-context'

function BrandingStyle() {
  const { currentSociety } = useSociety()
  useEffect(() => {
    const root = document.documentElement
    if (currentSociety.primaryColor) root.style.setProperty('--primary', currentSociety.primaryColor)
    else root.style.removeProperty('--primary')
    if (currentSociety.name) document.title = `${currentSociety.name} — Society Manager`
    return () => { root.style.removeProperty('--primary') }
  }, [currentSociety.primaryColor, currentSociety.name])
  return null
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const { authReady, user, memberships, isSuperAdmin, viewSociety, configured } = useAuth()
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking')

  useEffect(() => {
    if (!authReady) return
    if (!configured || !user) { router.replace('/login'); return }

    const mine = memberships.find(m => m.slug === slug)
    if (mine) { viewSociety(mine.societyId); setState('ok'); return }

    if (isSuperAdmin) {
      const sb = getSupabase()
      if (!sb) { setState('denied'); return }
      void sb.from('societies').select('id').eq('slug', slug).single().then(({ data }) => {
        if (data) { viewSociety(data.id); setState('ok') } else setState('denied')
      })
      return
    }
    setState('denied')
  }, [authReady, user, memberships, isSuperAdmin, slug, configured, viewSociety, router])

  if (state === 'checking') {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--muted-foreground)', fontSize: 13 }}>Loading workspace…</div>
  }
  if (state === 'denied') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
        <div className="empty-state">
          <h3>Workspace not found</h3>
          <p>You don&apos;t have access to &quot;{slug}&quot;, or it doesn&apos;t exist.</p>
          <button className="linkish" onClick={() => router.replace('/')}>Go back</button>
        </div>
      </div>
    )
  }
  return <><BrandingStyle />{children}</>
}
