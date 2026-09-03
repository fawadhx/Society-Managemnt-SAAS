'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, LayoutDashboard, LogOut, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const nav = [
  { href: '/admin', label: 'Clients', icon: Building2 },
  { href: '/admin/metrics', label: 'Metrics', icon: TrendingUp },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { authReady, user, isSuperAdmin, signOut, homePath } = useAuth()

  // A non-super-admin who lands here goes straight to where they belong
  // (their workspace, or /login). Never to '/', which would bounce back.
  useEffect(() => {
    if (!authReady || isSuperAdmin) return
    const dest = homePath ?? '/login'
    if (dest !== pathname) router.replace(dest)
  }, [authReady, isSuperAdmin, homePath, pathname, router])

  if (!authReady || !user || !isSuperAdmin) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--muted-foreground)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><LayoutDashboard size={19} /></div><span className="brand-text">Platform <b>Admin</b></span></div>
        <p className="nav-label">Console</p>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={(href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)) ? 'nav-item active' : 'nav-item'}>
              <Icon size={18} /><span className="nav-label-text">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => signOut().then(() => router.push('/login'))}><LogOut size={18} /><span className="nav-label-text">Sign out</span></button>
          <div className="profile"><div className="avatar"><Users size={15} /></div><div className="profile-info"><strong>{user.name}</strong><small>Super Admin</small></div></div>
        </div>
      </aside>
      <main className="main-content">
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  )
}
