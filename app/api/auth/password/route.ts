import { NextResponse, type NextRequest } from 'next/server'
import { checkPassword, isLockedOut, passwordConfigured, recordFailure } from '@/lib/auth/password'
import { getSession } from '@/lib/auth/session'
import { appUrl } from '@/lib/env'

export async function POST(request: NextRequest) {
  const back = (error: string) => NextResponse.redirect(`${appUrl()}/login?error=${error}`, 303)
  if (!passwordConfigured()) return back('no_password')

  const client = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
  if (isLockedOut(client)) return back('locked')

  const form = await request.formData()
  if (!checkPassword(String(form.get('password') ?? ''))) {
    recordFailure(client)
    await new Promise((r) => setTimeout(r, 500))
    return back('wrong_password')
  }

  const session = await getSession()
  session.authenticated = true
  session.sub = 'admin'
  await session.save()
  return NextResponse.redirect(`${appUrl()}/`, 303)
}
