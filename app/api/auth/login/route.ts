import { NextResponse } from 'next/server'
import * as client from 'openid-client'
import { getOidcConfig } from '@/lib/auth/oidc'
import { getSession } from '@/lib/auth/session'
import { appUrl, oidcEnabled } from '@/lib/env'

export async function GET() {
  if (!oidcEnabled()) return NextResponse.redirect(`${appUrl()}/login`)
  const config = await getOidcConfig()
  const codeVerifier = client.randomPKCECodeVerifier()
  const state = client.randomState()
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: `${appUrl()}/api/auth/callback`,
    scope: 'openid profile email',
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
  })

  const session = await getSession()
  session.oidcState = state
  session.oidcCodeVerifier = codeVerifier
  await session.save()
  return NextResponse.redirect(authUrl.href)
}
