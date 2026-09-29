import { timingSafeEqual } from 'node:crypto'
import { feedToken, appUrl } from '@/lib/env'
import type { Episode, Show } from '@/lib/db'

export function tokenOk(candidate: string): boolean {
  const a = Buffer.from(candidate)
  const b = Buffer.from(feedToken())
  return a.length === b.length && timingSafeEqual(a, b)
}

export const feedUrl = (show: Pick<Show, 'slug'>) => `${appUrl()}/f/${feedToken()}/${show.slug}.xml`
export const audioUrl = (ep: Pick<Episode, 'id'>) => `${appUrl()}/f/${feedToken()}/a/${ep.id}.mp3`
