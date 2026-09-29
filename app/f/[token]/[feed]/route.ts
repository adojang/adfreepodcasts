import { and, desc, eq } from 'drizzle-orm'
import { db, episodes, shows } from '@/lib/db'
import { buildFeed } from '@/lib/feeds/rss-build'
import { audioUrl, feedUrl, tokenOk } from '@/lib/feed-access'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: RouteContext<'/f/[token]/[feed]'>) {
  const { token, feed } = await ctx.params
  const slug = feed.replace(/\.xml$/, '')
  if (!tokenOk(token) || slug === feed) return new Response('Not found', { status: 404 })

  const show = await db().query.shows.findFirst({ where: eq(shows.slug, slug) })
  if (!show) return new Response('Not found', { status: 404 })

  const eps = await db().select().from(episodes)
    .where(and(eq(episodes.showId, show.id), eq(episodes.status, 'done')))
    .orderBy(desc(episodes.pubDate))

  const xml = buildFeed(show, eps, { self: feedUrl(show), audio: audioUrl })
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'private, max-age=300' },
  })
}
