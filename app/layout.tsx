import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { SocietyProvider } from '@/lib/society-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'Society Manager | Green Valley',
  description: 'Simplify your society. Stay on top of every payment.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SocietyProvider>
          {children}
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </SocietyProvider>
      </body>
    </html>
  )
}
