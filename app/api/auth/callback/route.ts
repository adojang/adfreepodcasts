import { NextRequest, NextResponse } from 'next/server'
import * as client from 'openid-client'
import { getOidcConfig } from '@/lib/auth/oidc'
import { getSession } from '@/lib/auth/session'
import { allowedEmails, appUrl } from '@/lib/env'

export async function GET(request: NextRequest) {
  const session = await getSession()
  const { oidcState, oidcCodeVerifier } = session
  if (!oidcState || !oidcCodeVerifier) return NextResponse.redirect(`${appUrl()}/login`)

  try {
    const config = await getOidcConfig()
    // Behind the proxy request.url is http://localhost…; rebuild it on the public origin.
    const callbackUrl = new URL(`${appUrl()}/api/auth/callback${request.nextUrl.search}`)
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: oidcCodeVerifier,
      expectedState: oidcState,
    })
    const sub = tokens.claims()?.sub
    if (!sub) throw new Error('No sub in ID token')
    const info = await client.fetchUserInfo(config, tokens.access_token, sub)
    const email = typeof info.email === 'string' ? info.email.toLowerCase() : ''

    if (!email || !allowedEmails().includes(email)) {
      session.destroy()
      return NextResponse.redirect(`${appUrl()}/login?error=not_allowed`)
    }

    session.authenticated = true
    session.sub = sub
    session.email = email
    session.name = info.name ?? undefined
    session.oidcState = undefined
    session.oidcCodeVerifier = undefined
    await session.save()
    return NextResponse.redirect(`${appUrl()}/`)
  } catch (err) {
    console.error('[auth] callback failed', err)
    session.destroy()
    return NextResponse.redirect(`${appUrl()}/login?error=failed`)
  }
}
