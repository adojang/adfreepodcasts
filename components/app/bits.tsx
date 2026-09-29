import type { EpisodeStatus } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS: Record<EpisodeStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  done: { label: 'Ad-free', variant: 'default' },
  pending: { label: 'Queued', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'secondary' },
  needs_review: { label: 'Needs review', variant: 'destructive' },
  failed: { label: 'Failed', variant: 'destructive' },
  skipped: { label: 'Not processed', variant: 'outline' },
  expired: { label: 'Expired', variant: 'outline' },
}

export function StatusBadge({ status }: { status: EpisodeStatus }) {
  const s = STATUS[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

/** Processing stages → rough progress, for the per-episode bar. */
export const STAGE_PROGRESS: Record<string, { value: number; label: string }> = {
  queued: { value: 5, label: 'Starting' },
  downloading: { value: 25, label: 'Downloading' },
  detecting: { value: 55, label: 'Finding ads' },
  rendering: { value: 85, label: 'Cutting' },
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** "5 min", "2 h 14 min" — for totals. */
export function fmtLong(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtShortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function Artwork({ src, className }: { src: string | null | undefined; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn('aspect-square shrink-0 rounded-lg bg-muted object-cover', className)} />
  ) : (
    <div className={cn('aspect-square shrink-0 rounded-lg bg-muted', className)} />
  )
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** The original timeline with cut segments highlighted, plus start/end labels. */
export function AdTimeline({ total, segments, className }: {
  total: number
  segments: Array<{ startSec: number; endSec: number }>
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-primary/25">
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute inset-y-0 bg-destructive"
            style={{ left: `${(s.startSec / total) * 100}%`, width: `${Math.max(0.4, ((s.endSec - s.startSec) / total) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary/40" /> kept</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" /> cut</span>
        </span>
        <span>{fmtDuration(total)}</span>
      </div>
    </div>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">AF</span>
      Ardwell Podcast
    </span>
  )
}
