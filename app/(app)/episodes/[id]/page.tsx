import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { asc, eq } from 'drizzle-orm'
import { adSegments, db, episodes, shows } from '@/lib/db'
import { afTitle } from '@/lib/feeds/rss-build'
import { audioUrl } from '@/lib/feed-access'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AutoRefresh, HearCutButton, MarkAdForm, ProcessButton, SegmentAction, StageProgress } from '@/components/app/client'
import { AdTimeline, Artwork, STAGE_PROGRESS, StatusBadge, fmtDate, fmtDuration } from '@/components/app/bits'

export const dynamic = 'force-dynamic'

const AUDIO_ID = 'episode-audio'

const SOURCE_LABEL: Record<string, string> = {
  megaphone: 'Host ad marker',
  diff: 'Differs between downloads',
  repeat: 'Repeats in other episodes',
  library: 'Known ad',
  manual: 'Marked by you',
}

export default async function EpisodePage({ params }: PageProps<'/episodes/[id]'>) {
  const { id } = await params
  const ep = await db().query.episodes.findFirst({ where: eq(episodes.id, Number(id)) })
  if (!ep) notFound()
  const [show, segs] = await Promise.all([
    db().query.shows.findFirst({ where: eq(shows.id, ep.showId) }),
    db().select().from(adSegments).where(eq(adSegments.episodeId, ep.id)).orderBy(asc(adSegments.startSec)),
  ])
  const busy = ep.status === 'pending' || ep.status === 'processing'
  const stage = ep.status === 'processing' ? STAGE_PROGRESS[ep.stage ?? 'queued'] : null

  // Where each cut sits in the published audio: its original start minus all
  // applied cuts before it.
  const rows = segs.map((s) => ({
    ...s,
    outAt: s.startSec - segs.filter((p) => p.applied && p.endSec <= s.startSec).reduce((n, p) => n + p.endSec - p.startSec, 0),
  }))

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh active={busy} />

      <section className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <Artwork src={ep.imageUrl ?? show?.artworkUrl} className="w-24 rounded-2xl shadow-lg ring-1 ring-border sm:w-32" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {show && (
            <Link href={`/shows/${show.slug}`} className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-4" /> {afTitle(show.title)}
            </Link>
          )}
          <h1 className="text-2xl font-semibold sm:text-3xl">{ep.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {stage ? <StageProgress {...stage} /> : <StatusBadge status={ep.status} />}
            <span>{fmtDate(ep.pubDate)}</span>
            {!busy && <ProcessButton id={ep.id} label={ep.status === 'done' ? 'Reprocess' : 'Process'} />}
          </div>
          {ep.error && ep.status !== 'done' && <p className="text-sm text-destructive">{ep.error}</p>}
        </div>
      </section>

      {ep.status === 'done' && ep.outputPath && (
        <Card>
          <CardHeader>
            <CardTitle>Ad-free episode</CardTitle>
            <CardDescription className="font-mono tabular-nums">
              {fmtDuration(ep.originalDuration)} → {fmtDuration(ep.outputDuration)} · <span className="text-primary">−{fmtDuration(ep.adSeconds)}</span> of ads
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <audio id={AUDIO_ID} controls preload="metadata" src={audioUrl(ep)} className="w-full [color-scheme:dark]" />
            {ep.originalDuration && <AdTimeline total={ep.originalDuration} segments={segs.filter((s) => s.applied)} />}
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What was cut</CardTitle>
            <CardDescription>Times are in the original download. &ldquo;Hear cut&rdquo; plays the join in the ad-free version.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {rows.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className={s.applied ? 'w-28 font-mono tabular-nums' : 'w-28 font-mono text-muted-foreground line-through tabular-nums'}>
                    {fmtDuration(s.startSec)}–{fmtDuration(s.endSec)}
                  </span>
                  <span className="hidden w-12 font-mono text-muted-foreground tabular-nums sm:inline">{fmtDuration(s.endSec - s.startSec)}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
                    {s.position && <Badge variant="outline" className="shrink-0 capitalize">{s.position}-roll</Badge>}
                    <span className="hidden truncate sm:inline">{SOURCE_LABEL[s.source]}{!s.applied && ' · kept, not sure'}</span>
                    {!s.position && <span className="truncate sm:hidden">{SOURCE_LABEL[s.source]}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.applied && ep.status === 'done' && <HearCutButton audioId={AUDIO_ID} at={s.outAt} />}
                    {s.fingerprint && ep.status === 'done' && <SegmentAction id={s.id} kind={s.applied ? 'not-ad' : 'accept'} />}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {ep.status === 'done' && ep.outputPath && (
        <Card>
          <CardHeader>
            <CardTitle>Missed an ad?</CardTitle>
            <CardDescription>Play to it above, tap Now at the start and end, then cut. It&apos;s removed here and from future episodes.</CardDescription>
          </CardHeader>
          <CardContent><MarkAdForm episodeId={ep.id} audioId={AUDIO_ID} /></CardContent>
        </Card>
      )}

      {ep.description && (
        <Card>
          <CardHeader><CardTitle>Show notes</CardTitle></CardHeader>
          <CardContent>
            <div className="flex max-w-none flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitize(ep.description) }} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Feed HTML is third-party: keep text + links only.
function sanitize(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?!\/?(p|br|a|b|strong|i|em|ul|ol|li)\b)[^>]*>/gi, '')
    .replace(/\s(on\w+|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*("|')\s*javascript:[^"']*\1/gi, 'href="#"')
}
