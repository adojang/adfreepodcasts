import { sql } from 'drizzle-orm'
import { blob, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () => integer('id').primaryKey({ autoIncrement: true })
const bool = (name: string) => integer(name, { mode: 'boolean' })
const time = (name: string) => integer(name, { mode: 'timestamp_ms' })
const createdAt = () => time('created_at').notNull().default(sql`(unixepoch('subsec') * 1000)`)
const bytes = (name: string) => blob(name, { mode: 'buffer' })

export const shows = sqliteTable('shows', {
  id: id(),
  slug: text('slug').notNull().unique(),
  appleId: text('apple_id'),
  feedUrl: text('feed_url').notNull().unique(),
  title: text('title').notNull(),
  author: text('author'),
  description: text('description'),
  artworkUrl: text('artwork_url'),
  link: text('link'),
  language: text('language'),
  categories: text('categories', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  explicit: bool('explicit').notNull().default(false),
  active: bool('active').notNull().default(true),
  lastPolledAt: time('last_polled_at'),
  lastPollError: text('last_poll_error'),
  createdAt: createdAt(),
})

export const EPISODE_STATUSES = [
  'skipped', // older than the backfill window — process on demand
  'pending',
  'processing',
  'done',
  'needs_review', // detector couldn't vouch for the result — not published
  'failed',
  'expired', // audio deleted by retention
] as const
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number]

export const episodes = sqliteTable('episodes', {
  id: id(),
  showId: integer('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  guid: text('guid').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  link: text('link'),
  imageUrl: text('image_url'),
  pubDate: time('pub_date').notNull(),
  season: integer('season'),
  episodeNumber: integer('episode_number'),
  episodeType: text('episode_type'),
  explicit: bool('explicit').notNull().default(false),
  sourceUrl: text('source_url').notNull(),
  status: text('status').$type<EpisodeStatus>().notNull().default('pending'),
  stage: text('stage'),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: time('next_attempt_at'),
  detector: text('detector'),
  originalBytes: integer('original_bytes'),
  originalDuration: real('original_duration'),
  outputPath: text('output_path'),
  outputBytes: integer('output_bytes'),
  outputDuration: real('output_duration'),
  adSeconds: real('ad_seconds'),
  processedAt: time('processed_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('episodes_show_guid').on(t.showId, t.guid),
  index('episodes_status').on(t.status),
])

/** Chromaprint of each episode's original download, for cross-episode repeat detection (kept out of `episodes` so list queries stay small). */
export const episodeFingerprints = sqliteTable('episode_fingerprints', {
  episodeId: integer('episode_id').primaryKey().references(() => episodes.id, { onDelete: 'cascade' }),
  fingerprint: bytes('fingerprint').notNull(),
})

export const adSegments = sqliteTable('ad_segments', {
  id: id(),
  episodeId: integer('episode_id').notNull().references(() => episodes.id, { onDelete: 'cascade' }),
  /** seconds in the ORIGINAL download's timeline */
  startSec: real('start_sec').notNull(),
  endSec: real('end_sec').notNull(),
  startByte: integer('start_byte'),
  endByte: integer('end_byte'),
  source: text('source').$type<AdSource>().notNull(),
  position: text('position'),
  label: text('label'),
  confidence: real('confidence').notNull(),
  applied: bool('applied').notNull().default(true),
  fingerprint: bytes('fingerprint'),
}, (t) => [index('ad_segments_episode').on(t.episodeId)])

/**
 * Per-show audio library: 'ad' entries are cut wherever they recur (learned
 * from detected ads and manual marks); 'keep' entries veto a cut ("not an ad").
 */
export const adLibrary = sqliteTable('ad_library', {
  id: id(),
  showId: integer('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'ad' | 'keep'>().notNull(),
  source: text('source').$type<AdSource>().notNull(),
  fingerprint: bytes('fingerprint').notNull(),
  durationSec: real('duration_sec').notNull(),
  hits: integer('hits').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('ad_library_show').on(t.showId)])

export type AdSource = 'megaphone' | 'diff' | 'repeat' | 'library' | 'manual'

export type Show = typeof shows.$inferSelect
export type Episode = typeof episodes.$inferSelect
export type AdSegment = typeof adSegments.$inferSelect
export type LibraryEntry = typeof adLibrary.$inferSelect
