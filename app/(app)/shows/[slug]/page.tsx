import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db, episodes, shows } from '@/lib/db'
import { afTitle } from '@/lib/feeds/rss-build'
import { feedUrl } from '@/lib/feed-access'
import { AutoRefresh, FeedBox, ProcessButton, ShowMenu, StageProgress } from '@/components/app/client'
import { Artwork, STAGE_PROGRESS, StatusBadge, fmtDuration, fmtShortDate } from '@/components/app/bits'

export const dynamic = 'force-dynamic'

const PAGE = 50

export default async function ShowPage({ params, searchParams }: PageProps<'/shows/[slug]'>) {
  const { slug } = await params
  const { all } = await searchParams
  const show = await db().query.shows.findFirst({ where: eq(shows.slug, slug) })
  if (!show) notFound()

  const eps = await db().select({
    id: episodes.id, title: episodes.title, status: episodes.status, stage: episodes.stage, pubDate: episodes.pubDate,
    error: episodes.error, outputDuration: episodes.outputDuration, adSeconds: episodes.adSeconds,
  }).from(episodes).where(eq(episodes.showId, show.id)).orderBy(desc(episodes.pubDate)).limit(all ? 1000 : PAGE)
  const busy = eps.some((e) => e.status === 'pending' || e.status === 'processing')

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh active={busy} />
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <Artwork src={show.artworkUrl} className="w-32 rounded-2xl shadow-lg ring-1 ring-border sm:w-48" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wider text-primary">Ad-free feed</div>
              <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{afTitle(show.title)}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {show.author}
                {show.lastPolledAt && <> · checked {show.lastPolledAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</>}
                {!show.active && ' · paused'}
              </p>
            </div>
            <ShowMenu id={show.id} active={show.active} title={afTitle(show.title)} />
          </div>
          {show.lastPollError && <p className="text-sm text-destructive">Last check failed: {show.lastPollError}</p>}
          <FeedBox url={feedUrl(show)} />
          <p className="text-xs text-muted-foreground">The token in this link is the only lock — keep it to yourself.</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Episodes</h2>
        <div className="divide-y rounded-xl border bg-card">
          {eps.map((e) => {
            const stage = e.status === 'processing' ? STAGE_PROGRESS[e.stage ?? 'queued'] : null
            const muted = e.status === 'skipped' || e.status === 'expired'
            return (
              <div key={e.id} className="flex items-center gap-4 px-4 py-3">
                <span className="hidden w-14 shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:block">{fmtShortDate(e.pubDate)}</span>
                <Link href={`/episodes/${e.id}`} className="min-w-0 flex-1 hover:underline">
                  <div className={muted ? 'truncate text-muted-foreground' : 'truncate font-medium'}>{e.title}</div>
                  {e.status === 'done' && (
                    <div className="font-mono text-xs text-muted-foreground tabular-nums">
                      {fmtDuration(e.outputDuration)} · <span className="text-primary">−{fmtDuration(e.adSeconds)}</span> ads
                    </div>
                  )}
                  {e.error && (e.status === 'failed' || e.status === 'needs_review') && (
                    <div className="truncate text-xs text-destructive">{e.error}</div>
                  )}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {stage && <StageProgress {...stage} />}
                  {muted && <ProcessButton id={e.id} />}
                  {(e.status === 'failed' || e.status === 'needs_review') && <ProcessButton id={e.id} label="Retry" />}
                  {!stage && !muted && <StatusBadge status={e.status} />}
                </div>
              </div>
            )
          })}
        </div>
        {!all && eps.length === PAGE && (
          <Link href={`/shows/${slug}?all=1`} className="text-center text-sm text-muted-foreground hover:underline">Show all episodes</Link>
        )}
      </section>
    </div>
  )
}
