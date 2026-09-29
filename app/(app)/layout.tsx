import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/app/bits'

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/"><Logo /></Link>
          <form action="/api/auth/logout" method="post">
            <Button variant="ghost" size="sm" type="submit"><LogOut /> Sign out</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">{children}</main>
    </>
  )
}
