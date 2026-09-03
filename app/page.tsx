'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function Home() {
  const router = useRouter()
  const pathname = usePathname()
  const { authReady, homePath } = useAuth()

  useEffect(() => {
    if (!authReady) return
    const dest = homePath ?? '/login'
    if (dest !== pathname) router.replace(dest)
  }, [authReady, homePath, pathname, router])

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--muted-foreground)', fontSize: 13 }}>
      Loading…
    </div>
  )
}
