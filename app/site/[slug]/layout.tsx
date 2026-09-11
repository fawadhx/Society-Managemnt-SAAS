import type { ReactNode } from 'react'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="site-root">{children}</div>
}
