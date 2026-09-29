'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Ellipsis, ExternalLink, Loader2, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  acceptSuggestionAction, addShowAction, deleteShowAction, markAdAction, notAdAction, processEpisodeAction, setShowActiveAction,
} from '@/app/actions'

export function AddShowForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addShowAction>> | null, form: FormData) => {
    const res = await addShowAction(prev, form)
    if (res.ok && res.slug) router.push(`/shows/${res.slug}`)
    return res
  }, null)
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="url"
          required
          placeholder="Paste an Apple Podcasts link — podcasts.apple.com/…/id1773188988"
          aria-label="Apple Podcasts link or RSS URL"
          disabled={pending}
          className="h-10"
        />
        <Button type="submit" size="lg" disabled={pending} className="h-10 px-4">
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          {pending ? 'Looking it up…' : 'Add show'}
        </Button>
      </div>
      {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}

/** The private feed URL with copy + open-in-Podcasts. */
export function FeedBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Feed URL copied', { description: 'Apple Podcasts → Library → ⋯ → Follow a Show by URL' })
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={copy}
        title="Copy feed URL"
        className="flex h-9 min-w-0 flex-1 items-center rounded-lg border bg-muted/50 px-3 text-left font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="truncate">{url}</span>
      </button>
      <div className="flex gap-2">
        <Button size="lg" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
        {/* podcast:// hands the feed straight to Apple Podcasts on iOS/macOS. */}
        <a href={url.replace(/^https:\/\//, 'podcast://')}>
          <Button variant="outline" size="lg"><ExternalLink /> Open in Podcasts</Button>
        </a>
      </div>
    </div>
  )
}

export function ProcessButton({ id, label = 'Process' }: { id: number; label?: string }) {
  const [pending, start] = useTransition()
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      await processEpisodeAction(id)
      toast.success('Queued')
    })}>
      {pending && <Loader2 className="animate-spin" />} {label}
    </Button>
  )
}

export function ShowMenu({ id, active, title }: { id: number; active: boolean; title: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label="Show options" />}>
          {pending ? <Loader2 className="animate-spin" /> : <Ellipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => start(() => setShowActiveAction(id, !active))}>
            {active ? <Pause /> : <Play />} {active ? 'Pause checking' : 'Resume checking'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 /> Delete show
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              The feed stops working in Apple Podcasts and all processed audio is deleted. You can add the show again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
              await deleteShowAction(id)
              router.push('/')
            })}>
              {pending && <Loader2 className="animate-spin" />} Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function StageProgress({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex w-32 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}…</span>
      <Progress value={value} />
    </div>
  )
}

export function AutoRefresh({ active, ms = 4000 }: { active: boolean; ms?: number }) {
  const router = useRouter()
  useInterval(() => router.refresh(), active ? ms : null)
  return null
}

function useInterval(fn: () => void, ms: number | null) {
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn }, [fn])
  useEffect(() => {
    if (ms == null) return
    const t = setInterval(() => saved.current(), ms)
    return () => clearInterval(t)
  }, [ms])
}

const fmtClock = (t: number) => {
  const s = Math.floor(t)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

const audioEl = (id: string) => document.getElementById(id) as HTMLAudioElement | null

/** Plays the published audio from just before a cut, to hear the join. */
export function HearCutButton({ audioId, at }: { audioId: string; at: number }) {
  return (
    <Button size="xs" variant="ghost" onClick={() => {
      const el = audioEl(audioId)
      if (!el) return
      el.currentTime = Math.max(0, at - 4)
      void el.play()
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }}>
      <Play /> Hear cut
    </Button>
  )
}

/** Mark a missed ad on the published audio; "Now" grabs the player's position. */
export function MarkAdForm({ episodeId, audioId }: { episodeId: number; audioId: string }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [state, formAction, pending] = useActionState(markAdAction.bind(null, episodeId), null)
  const now = () => fmtClock(audioEl(audioId)?.currentTime ?? 0)
  useEffect(() => {
    if (state?.ok) toast.success('Marked — reprocessing', { description: 'Future episodes will skip this ad too.' })
  }, [state])
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <TimeField name="start" label="From" value={start} onChange={setStart} onNow={() => setStart(now())} />
        <TimeField name="end" label="To" value={end} onChange={setEnd} onNow={() => setEnd(now())} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Cut as ad
        </Button>
      </div>
      {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}

function TimeField({ name, label, value, onChange, onNow }: {
  name: string; label: string; value: string; onChange: (v: string) => void; onNow: () => void
}) {
  return (
    <div className="flex items-center rounded-lg border">
      <span className="pl-3 text-xs text-muted-foreground">{label}</span>
      <Input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="m:ss"
        required
        className="w-20 border-0 font-mono tabular-nums shadow-none focus-visible:ring-0"
      />
      <Button type="button" variant="ghost" size="sm" onClick={onNow} className="mr-0.5">Now</Button>
    </div>
  )
}

export function SegmentAction({ id, kind }: { id: number; kind: 'not-ad' | 'accept' }) {
  const [pending, start] = useTransition()
  return (
    <Button size="xs" variant={kind === 'accept' ? 'secondary' : 'ghost'} disabled={pending} onClick={() => start(async () => {
      await (kind === 'accept' ? acceptSuggestionAction(id) : notAdAction(id))
      toast.success('Saved — reprocessing')
    })}>
      {pending && <Loader2 className="animate-spin" />} {kind === 'accept' ? 'Cut it' : 'Not an ad'}
    </Button>
  )
}
