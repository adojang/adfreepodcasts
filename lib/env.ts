import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required setting ${name} — see .env.example`)
  return v
}

/** Public HTTPS origin of this install, e.g. https://podcasts.example.com */
export const appUrl = () => (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? requireEnv('APP_URL')).replace(/\/$/, '')
export const dataDir = () => resolve(process.env.DATA_DIR ?? 'data')
export const audioDir = () => join(dataDir(), 'audio')
export const tmpDir = () => join(dataDir(), 'tmp')

export const MIN_PASSWORD_LENGTH = 16
export const adminPassword = () => process.env.ADMIN_PASSWORD ?? ''

export const oidcEnabled = () => !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET)
/** OIDC sign-in is only allowed for these (lower-cased) emails. */
export const allowedEmails = () => (process.env.ALLOWED_EMAIL ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)

/** Prepended to each show's title in its feed, e.g. "AF Warfronts". */
export const feedTitlePrefix = () => process.env.FEED_TITLE_PREFIX ?? 'AF '

/** Processed episodes kept per show; older audio is deleted. */
export const RETENTION_PER_SHOW = Number(process.env.RETENTION_PER_SHOW ?? 15)
/** Episodes processed immediately when a show is added. */
export const BACKFILL_COUNT = Number(process.env.BACKFILL_COUNT ?? 3)
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MINUTES ?? 15) * 60_000

interface Secrets { sessionSecret: string; feedToken: string }
let _secrets: Secrets | null = null

/**
 * Session secret and feed token: taken from SESSION_SECRET / FEED_TOKEN if
 * set, otherwise generated once and kept in data/secrets.json so there are
 * two fewer things to configure. Deleting that file signs everyone out and
 * changes every feed URL.
 */
export function secrets(): Secrets {
  if (_secrets) return _secrets
  const file = join(dataDir(), 'secrets.json')
  const stored: Partial<Secrets> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const generated: Secrets = {
    sessionSecret: stored.sessionSecret ?? randomBytes(32).toString('hex'),
    feedToken: stored.feedToken ?? randomBytes(16).toString('hex'),
  }
  if (generated.sessionSecret !== stored.sessionSecret || generated.feedToken !== stored.feedToken) {
    mkdirSync(dataDir(), { recursive: true })
    writeFileSync(file, JSON.stringify(generated, null, 2), { mode: 0o600 })
  }
  _secrets = {
    sessionSecret: process.env.SESSION_SECRET || generated.sessionSecret,
    feedToken: process.env.FEED_TOKEN || generated.feedToken,
  }
  return _secrets
}

export const feedToken = () => secrets().feedToken
