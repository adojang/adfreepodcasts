import { KeyRound } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Logo } from '@/components/app/bits'
import { passwordConfigured } from '@/lib/auth/password'
import { MIN_PASSWORD_LENGTH, oidcEnabled } from '@/lib/env'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  wrong_password: 'Wrong password.',
  locked: 'Too many attempts. Wait 15 minutes and try again.',
  no_password: `No admin password is set. Put ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters) in .env and restart.`,
  not_allowed: 'That account is not in ALLOWED_EMAIL.',
  failed: 'Sign-in failed. Try again.',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams
  const message = typeof error === 'string' ? ERRORS[error] : undefined
  const password = passwordConfigured()
  const sso = oidcEnabled()
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Your podcasts, minus the ads.</h1>
          <p className="text-muted-foreground">Sign in to manage your ad-free feeds.</p>
        </div>
        <div className="flex flex-col gap-4">
          {message && <p className="text-sm text-destructive">{message}</p>}
          {!password && !sso && !message && <p className="text-sm text-destructive">{ERRORS.no_password}</p>}
          {password && (
            <form action="/api/auth/password" method="post" className="flex flex-col gap-2">
              <Input type="password" name="password" required autoFocus autoComplete="current-password" placeholder="Admin password" className="h-11" />
              <Button type="submit" size="lg" className="h-11 w-full">Sign in</Button>
            </form>
          )}
          {password && sso && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" /> or <Separator className="flex-1" />
            </div>
          )}
          {sso && (
            // Plain <a>, not <Link>: prefetching the login route would start an OIDC flow.
            <a href="/api/auth/login" className={buttonVariants({ size: 'lg', variant: password ? 'outline' : 'default', className: 'h-11 w-full' })}>
              <KeyRound /> Sign in with {process.env.OIDC_NAME ?? 'SSO'}
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
