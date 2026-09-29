import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/auth/session'
import { appUrl } from '@/lib/env'

// Public: login flow, and /f/* (feed + audio, guarded by the secret feed token in the route itself).
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/f\//]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next()

  const response = NextResponse.next()
  const session = await getIronSession<SessionData>(request, response, sessionOptions())
  if (session.authenticated) return response

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.redirect(`${appUrl()}/login`)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)'],
}
