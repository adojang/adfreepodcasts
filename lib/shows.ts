import { eq } from 'drizzle-orm'
import { db, episodes, shows, type Show } from '@/lib/db'
import { lookupApple, parseAppleId } from '@/lib/feeds/apple'
import { fetchFeed, type ParsedChannel, type ParsedItem } from '@/lib/feeds/rss-parse'
import { BACKFILL_COUNT } from '@/lib/env'

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'show'
}

function channelFields(ch: ParsedChannel) {
  return {
    title: ch.title,
    author: ch.author ?? null,
    description: ch.description ?? null,
    artworkUrl: ch.artworkUrl ?? null,
    link: ch.link ?? null,
    language: ch.language ?? null,
    categories: ch.categories,
    explicit: ch.explicit,
  }
}

function episodeFields(showId: number, it: ParsedItem) {
  return {
    showId,
    guid: it.guid,
    title: it.title,
    description: it.description ?? null,
    link: it.link ?? null,
    imageUrl: it.imageUrl ?? null,
    pubDate: it.pubDate,
    season: it.season ?? null,
    episodeNumber: it.episodeNumber ?? null,
    episodeType: it.episodeType ?? null,
    explicit: it.explicit,
    sourceUrl: it.enclosureUrl,
  }
}

/** Accepts an Apple Podcasts link, a bare Apple id, or a direct RSS URL. */
export async function addShow(input: string): Promise<Show> {
  const appleId = parseAppleId(input)
  let feedUrl: string
  if (appleId) {
    feedUrl = (await lookupApple(appleId)).feedUrl
  } else if (/^https?:\/\//i.test(input.trim())) {
    feedUrl = input.trim()
  } else {
    throw new Error('Paste an Apple Podcasts link (https://podcasts.apple.com/…/id123) or an RSS feed URL')
  }

  const existing = await db().query.shows.findFirst({ where: eq(shows.feedUrl, feedUrl) })
  if (existing) return existing

  const ch = await fetchFeed(feedUrl)
  let slug = slugify(ch.title)
  if (await db().query.shows.findFirst({ where: eq(shows.slug, slug) })) slug = `${slug}-${Date.now().toString(36)}`

  const [show] = await db().insert(shows)
    .values({ slug, appleId, feedUrl, ...channelFields(ch), lastPolledAt: new Date() })
    .returning()

  // Newest BACKFILL_COUNT get processed now; older ones are recorded as
  // skipped so the poller never treats them as new.
  if (ch.items.length) {
    await db().insert(episodes).values(ch.items.map((it, i) => ({
      ...episodeFields(show.id, it),
      status: i < BACKFILL_COUNT ? ('pending' as const) : ('skipped' as const),
    }))).onConflictDoNothing()
  }
  return show
}

/** Refreshes show metadata and queues any episode not seen before. Returns the number queued. */
export async function pollShow(show: Show): Promise<number> {
  try {
    const ch = await fetchFeed(show.feedUrl)
    await db().update(shows).set({ ...channelFields(ch), lastPolledAt: new Date(), lastPollError: null })
      .where(eq(shows.id, show.id))
    if (!ch.items.length) return 0
    const inserted = await db().insert(episodes)
      .values(ch.items.map((it) => ({ ...episodeFields(show.id, it), status: 'pending' as const })))
      .onConflictDoNothing()
      .returning({ id: episodes.id })
    return inserted.length
  } catch (err) {
    await db().update(shows).set({ lastPolledAt: new Date(), lastPollError: String(err instanceof Error ? err.message : err) })
      .where(eq(shows.id, show.id))
    throw err
  }
}

export async function pollAll(): Promise<void> {
  const active = await db().select().from(shows).where(eq(shows.active, true))
  for (const s of active) {
    try {
      const n = await pollShow(s)
      if (n) console.log(`[poll] ${s.title}: ${n} new episode(s)`)
    } catch (err) {
      console.error(`[poll] ${s.title} failed:`, err)
    }
  }
}
