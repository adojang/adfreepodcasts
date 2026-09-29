import Link from 'next/link'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db, episodes, shows } from '@/lib/db'
import { afTitle } from '@/lib/feeds/rss-build'
import { AddShowForm, AutoRefresh, StageProgress } from '@/components/app/client'
import { Artwork, STAGE_PROGRESS, Stat, StatusBadge, fmtDuration, fmtLong, fmtShortDate } from '@/components/app/bits'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const [allShows, stats, recent] = await Promise.all([
    db().select().from(shows).orderBy(shows.title),
    db().select({
      showId: episodes.showId,
      done: sql<number>`count(*) filter (where ${episodes.status} in ('done','expired'))`,
      adSeconds: sql<number>`coalesce(sum(${episodes.adSeconds}) filter (where ${episodes.status} in ('done','expired')), 0)`,
      busy: sql<number>`count(*) filter (where ${episodes.status} in ('pending','processing'))`,
    }).from(episodes).groupBy(episodes.showId),
    db().select({
      id: episodes.id, title: episodes.title, status: episodes.status, stage: episodes.stage, pubDate: episodes.pubDate,
      adSeconds: episodes.adSeconds, imageUrl: episodes.imageUrl, showTitle: shows.title, artworkUrl: shows.artworkUrl,
    }).from(episodes)
      .innerJoin(shows, eq(shows.id, episodes.showId))
      .where(inArray(episodes.status, ['pending', 'processing', 'done', 'needs_review', 'failed']))
      .orderBy(desc(episodes.pubDate)).limit(10),
  ])
  const byShow = new Map(stats.map((s) => [s.showId, s]))
  const totalAds = stats.reduce((n, s) => n + s.adSeconds, 0)
  const totalDone = stats.reduce((n, s) => n + s.done, 0)
  const busy = stats.some((s) => s.busy > 0)

  return (
    <div className="flex flex-col gap-10">
      <AutoRefresh active={busy} />

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">Your podcasts, minus the ads.</h1>
          <p className="max-w-2xl text-muted-foreground">
            Add a show and every new episode is downloaded, stripped of ads and published to a private feed within 15 minutes.
          </p>
        </div>
        <AddShowForm />
        {allShows.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Shows" value={String(allShows.length)} />
            <Stat label="Episodes cleaned" value={String(totalDone)} />
            <Stat label="Ads removed" value={fmtLong(totalAds)} />
          </div>
        )}
      </section>

      {allShows.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Shows</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {allShows.map((s) => {
              const st = byShow.get(s.id)
              return (
                <Link key={s.id} href={`/shows/${s.slug}`} className="group flex flex-col gap-2.5">
                  <div className="relative">
                    <Artwork src={s.artworkUrl} className="w-full rounded-xl ring-1 ring-border transition group-hover:ring-2 group-hover:ring-primary" />
                    {!s.active && (
                      <span className="absolute left-2 top-2 rounded-md bg-background/85 px-1.5 py-0.5 text-xs backdrop-blur">Paused</span>
                    )}
                    {!!st?.busy && (
                      <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-xs backdrop-blur">
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Working
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{afTitle(s.title)}</div>
                    <div className="font-mono text-xs text-muted-foreground tabular-nums">
                      {st?.done ?? 0} eps · {fmtLong(st?.adSeconds ?? 0)} cut
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Latest episodes</h2>
          <div className="divide-y rounded-xl border bg-card">
            {recent.map((e) => {
              const stage = e.status === 'processing' ? STAGE_PROGRESS[e.stage ?? 'queued'] : null
              return (
                <Link key={e.id} href={`/episodes/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50">
                  <Artwork src={e.imageUrl ?? e.artworkUrl} className="size-11 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {afTitle(e.showTitle)} · {fmtShortDate(e.pubDate)}
                    </div>
                  </div>
                  {stage ? <StageProgress {...stage} /> : e.status === 'done' ? (
                    <span className="shrink-0 font-mono text-sm text-primary tabular-nums">−{fmtDuration(e.adSeconds)}</span>
                  ) : <StatusBadge status={e.status} />}
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
