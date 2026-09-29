import { getIronSession, type IronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { appUrl, secrets } from '@/lib/env'

export interface SessionData {
  authenticated?: boolean
  sub?: string
  email?: string
  name?: string
  oidcState?: string
  oidcCodeVerifier?: string
}

export function sessionOptions(): SessionOptions {
  return {
    password: secrets().sessionSecret,
    cookieName: 'ardwell-podcast-session',
    cookieOptions: {
      secure: appUrl().startsWith('https://'),
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    },
  }
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions())
}
