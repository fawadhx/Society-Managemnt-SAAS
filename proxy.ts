import { NextResponse, type NextRequest } from 'next/server'

/**
 * Tier-3 subdomain resolution (opt-in).
 *
 * When NEXT_PUBLIC_MULTI_DOMAIN=1 a request to `acme.example.com/` is rewritten
 * to `/acme` so a Tier-3 client's branded workspace lives at its own hostname.
 * Otherwise every workspace is reached at the path `/<slug>` and this middleware
 * is a no-op. Auth/tenant checks still run client-side in the [slug] layout.
 */

const ROOT_HOSTS = new Set(['localhost', '127.0.0.1'])

export function proxy(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_MULTI_DOMAIN !== '1') return NextResponse.next()

  const host = (req.headers.get('host') ?? '').split(':')[0]
  const parts = host.split('.')
  const isSub = parts.length > 2 && !ROOT_HOSTS.has(host)
  if (!isSub) return NextResponse.next()

  const sub = parts[0]
  if (['www', 'app', 'admin', 'api'].includes(sub)) return NextResponse.next()

  const url = req.nextUrl
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = `/${sub}`
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.png$|.*\\.svg$).*)'],
}
