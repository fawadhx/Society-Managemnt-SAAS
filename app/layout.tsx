import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/lib/auth-context'
import { SubscriptionProvider } from '@/lib/subscription-context'
import { SocietyProvider } from '@/lib/society-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'Society Manager',
  description: 'Simplify your society or plaza. Stay on top of every payment.',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('sm-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <SubscriptionProvider>
            <SocietyProvider>
              {children}
              {process.env.NODE_ENV === 'production' && <Analytics />}
            </SocietyProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
