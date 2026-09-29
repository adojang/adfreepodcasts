import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { adLibrary, adSegments, db, episodes } from '@/lib/db'
import { run } from '@/lib/audio/ffmpeg'
import { ITEM_SEC, coverage, findMatches, fingerprint, fpFromBuffer, fpToBuffer } from '@/lib/detect/fingerprint'
import { enqueue } from '@/lib/pipeline'
import { tmpDir } from '@/lib/env'

export const MIN_MARK_SEC = 5
export const MAX_MARK_SEC = 600
const CLIP_TAIL_PAD_SEC = 3

/**
 * "This is an ad": fingerprints [start,end) of the published (ad-free) file,
 * stores it in the show's library and reprocesses — the ad is then found
 * wherever it lands in the fresh download, and in future episodes.
 */
export async function markAd(episodeId: number, startSec: number, endSec: number): Promise<void> {
  if (!(endSec - startSec >= MIN_MARK_SEC && endSec - startSec <= MAX_MARK_SEC)) {
    throw new Error(`Mark between ${MIN_MARK_SEC}s and ${MAX_MARK_SEC / 60} min`)
  }
  const ep = await db().query.episodes.findFirst({ where: eq(episodes.id, episodeId) })
  if (!ep?.outputPath) throw new Error('Episode has no published audio')
  if (endSec > (ep.outputDuration ?? 0) + 1) throw new Error('Mark is past the end of the episode')

  const dir = await mkdtemp(join(tmpDir(), 'mark-'))
  try {
    const clip = join(dir, 'clip.mp3')
    // Chromaprint emits no items for the last ~2.3 s of its input, so fingerprint
    // a padded clip and trim back to exactly the marked span.
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(startSec), '-i', ep.outputPath,
      '-t', String(endSec - startSec + CLIP_TAIL_PAD_SEC), '-map', '0:a', '-c', 'copy', clip])
    const fp = (await fingerprint(clip)).slice(0, Math.round((endSec - startSec) / ITEM_SEC))
    await db().insert(adLibrary).values({
      showId: ep.showId, kind: 'ad', source: 'manual', fingerprint: fpToBuffer(fp), durationSec: fp.length * ITEM_SEC,
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  await enqueue(episodeId)
}

/** "Not an ad": vetoes this audio for the show, forgets matching learned ads, reprocesses. */
export async function markNotAd(segmentId: number): Promise<void> {
  const seg = await db().query.adSegments.findFirst({ where: eq(adSegments.id, segmentId) })
  if (!seg?.fingerprint) throw new Error('This segment came from the host’s own ad markers and can’t be overridden')
  const ep = await db().query.episodes.findFirst({ where: eq(episodes.id, seg.episodeId) })
  if (!ep) throw new Error('Episode not found')

  const segFp = fpFromBuffer(seg.fingerprint)
  const ads = await db().select().from(adLibrary).where(and(eq(adLibrary.showId, ep.showId), eq(adLibrary.kind, 'ad')))
  for (const entry of ads) {
    const e = fpFromBuffer(entry.fingerprint)
    const covered = coverage(findMatches(e, segFp)).reduce((n, [s, x]) => n + x - s, 0)
    if (covered >= e.length * 0.5) await db().delete(adLibrary).where(eq(adLibrary.id, entry.id))
  }
  await db().insert(adLibrary).values({
    showId: ep.showId, kind: 'keep', source: seg.source, fingerprint: seg.fingerprint, durationSec: seg.endSec - seg.startSec,
  })
  await enqueue(ep.id)
}

/** Promote a low-confidence suggestion to a library ad and reprocess. */
export async function acceptSuggestion(segmentId: number): Promise<void> {
  const seg = await db().query.adSegments.findFirst({ where: eq(adSegments.id, segmentId) })
  if (!seg?.fingerprint) throw new Error('Segment has no fingerprint')
  const ep = await db().query.episodes.findFirst({ where: eq(episodes.id, seg.episodeId) })
  if (!ep) throw new Error('Episode not found')
  await db().insert(adLibrary).values({
    showId: ep.showId, kind: 'ad', source: 'manual', fingerprint: seg.fingerprint, durationSec: seg.endSec - seg.startSec,
  })
  await enqueue(ep.id)
}
