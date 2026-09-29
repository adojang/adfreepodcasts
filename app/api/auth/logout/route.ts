import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { appUrl } from '@/lib/env'

export async function POST() {
  const session = await getSession()
  session.destroy()
  return NextResponse.redirect(`${appUrl()}/login`, 303)
}
