'use server'

import { rm } from 'node:fs/promises'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, episodes, shows } from '@/lib/db'
import { enqueue } from '@/lib/pipeline'
import { addShow } from '@/lib/shows'
import { getSession } from '@/lib/auth/session'
import { acceptSuggestion, markAd, markNotAd } from '@/lib/library'

async function requireAuth() {
  const s = await getSession()
  if (!s.authenticated) throw new Error('Unauthorized')
}

export type ActionResult = { ok: true; slug?: string } | { ok: false; error: string }

export async function addShowAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAuth()
  try {
    const show = await addShow(String(form.get('url') ?? ''))
    revalidatePath('/')
    return { ok: true, slug: show.slug }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function processEpisodeAction(id: number) {
  await requireAuth()
  await enqueue(id)
  revalidatePath('/', 'layout')
}

export async function setShowActiveAction(id: number, active: boolean) {
  await requireAuth()
  await db().update(shows).set({ active }).where(eq(shows.id, id))
  revalidatePath('/', 'layout')
}

export async function deleteShowAction(id: number) {
  await requireAuth()
  const eps = await db().select({ path: episodes.outputPath }).from(episodes).where(eq(episodes.showId, id))
  for (const e of eps) if (e.path) await rm(e.path, { force: true })
  await db().delete(shows).where(eq(shows.id, id))
  revalidatePath('/', 'layout')
}

/** "m:ss", "h:mm:ss" or plain seconds. */
function parseTime(s: string): number {
  const parts = s.trim().split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) throw new Error(`Bad time "${s}"`)
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

export async function markAdAction(episodeId: number, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAuth()
  try {
    await markAd(episodeId, parseTime(String(form.get('start'))), parseTime(String(form.get('end'))))
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function notAdAction(segmentId: number) {
  await requireAuth()
  await markNotAd(segmentId)
  revalidatePath('/', 'layout')
}

export async function acceptSuggestionAction(segmentId: number) {
  await requireAuth()
  await acceptSuggestion(segmentId)
  revalidatePath('/', 'layout')
}
