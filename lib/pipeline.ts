import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { adLibrary, adSegments, db, episodeFingerprints, episodes, type Episode } from '@/lib/db'
import { downloadEpisode } from '@/lib/audio/download'
import { concatByteRanges, cutByTime, probeDuration, readAt, remuxMp3 } from '@/lib/audio/ffmpeg'
import { ITEM_SEC, fingerprint, fpFromBuffer, fpToBuffer } from '@/lib/detect/fingerprint'
import {
  AUTO_CUT_CONFIDENCE, diffCandidates, libraryMatches, mergeCandidates, repeatCandidates, type Candidate,
} from '@/lib/detect/generic'
import {
  MEGAPHONE_HEADER, boundaryOffsets, byteToSeconds, isFrameSync, keptRanges, parseMegaphonePayload, validateRanges,
} from '@/lib/detect/megaphone'
import { audioDir, RETENTION_PER_SHOW, tmpDir } from '@/lib/env'
import { invert, timelineMapper } from '@/lib/audio/timeline'

const MAX_ATTEMPTS = 5
/** Refuse to publish if "ads" would remove more than this share of the episode. */
const MAX_AD_SHARE = 0.6
/** Allowed drift between expected and measured output duration. */
const DURATION_TOLERANCE_SEC = 3
/** Previous episodes compared for repeated (promo) audio. */
const REPEAT_LOOKBACK = 3
/** Learned 'ad' library entries kept per show. */
const LIBRARY_CAP = 300
/** Second download for diffing: a different client gets a different DAI fill. */
const ALT_UA = 'curl/8.5.0'

/** Thrown when the result can't be trusted: episode is parked for review, not retried. */
export class NeedsReview extends Error {}

type NewSegment = typeof adSegments.$inferInsert

async function setStage(id: number, stage: string) {
  await db().update(episodes).set({ stage }).where(eq(episodes.id, id))
}

/** Claims the next due pending episode (oldest first). The worker is the only claimer (one process). */
export async function claimNext(): Promise<Episode | null> {
  const due = db().select({ id: episodes.id }).from(episodes)
    .where(and(eq(episodes.status, 'pending'), or(isNull(episodes.nextAttemptAt), lte(episodes.nextAttemptAt, new Date()))))
    .orderBy(asc(episodes.pubDate)).limit(1).get()
  if (!due) return null
  return db().update(episodes)
    .set({ status: 'processing', stage: 'queued', attempts: sql`${episodes.attempts} + 1` })
    .where(eq(episodes.id, due.id)).returning().get() ?? null
}

/** Episodes left in `processing` by a crashed worker go back to the queue. */
export async function requeueStale(): Promise<void> {
  await db().update(episodes).set({ status: 'pending', stage: null }).where(eq(episodes.status, 'processing'))
}

export async function processEpisode(ep: Episode): Promise<void> {
  const work = join(tmpDir(), String(ep.id))
  await mkdir(work, { recursive: true })
  try {
    await setStage(ep.id, 'downloading')
    const dl = await downloadEpisode(ep.sourceUrl, join(work, 'original.mp3'))
    const originalDuration = await probeDuration(dl.path)

    await setStage(ep.id, 'detecting')
    const header = dl.headers.get(MEGAPHONE_HEADER)
    const isMegaphone = /(^|\.)megaphone\.fm$/.test(new URL(dl.finalUrl).hostname)
    const segments: NewSegment[] = []
    const detectors: string[] = []

    // Stage 1 — host-reported DAI (exact byte ranges). `joined` is the file
    // with those removed; `toOriginal` maps its seconds back to the download's.
    let joined = dl.path
    let toOriginal = (t: number) => t
    if (header) {
      detectors.push('megaphone')
      const p = parseMegaphonePayload(header)
      validateRanges(p, dl.bytes)
      const offsets = boundaryOffsets(p, dl.bytes)
      const heads = await readAt(dl.path, offsets, 4)
      const bad = offsets.filter((_, i) => !isFrameSync(heads[i], 0))
      if (bad.length) throw new NeedsReview(`Megaphone ad boundaries not on MP3 frames at bytes ${bad.join(', ')}`)
      for (const a of p.ads) {
        segments.push({
          episodeId: ep.id, startSec: byteToSeconds(p, a.start), endSec: byteToSeconds(p, a.end),
          startByte: a.start, endByte: a.end, source: 'megaphone', position: a.position, label: a.adId, confidence: 1,
        })
      }
      const kept = keptRanges(p, dl.bytes)
      joined = join(work, 'joined.mp3')
      await concatByteRanges(dl.path, kept, joined)
      toOriginal = timelineMapper(kept.map(([s, e]) => [byteToSeconds(p, s), byteToSeconds(p, e)]))
    } else if (isMegaphone) {
      throw new NeedsReview('Megaphone episode served without x-megaphone-payload-2 — ad positions unknown')
    }

    // Stage 2 — fingerprint detectors on what's left.
    const fp = await fingerprint(joined)
    const cands: Candidate[] = []
    if (!header) {
      detectors.push('diff', 'repeat')
      const alt = await downloadEpisode(ep.sourceUrl, join(work, 'alt.mp3'), ALT_UA).catch((err) => {
        console.warn(`[pipeline] #${ep.id} second download failed, skipping diff: ${err.message}`)
        return null
      })
      if (alt) {
        cands.push(...diffCandidates(fp, await fingerprint(alt.path)))
        await rm(alt.path, { force: true })
      }
      cands.push(...repeatCandidates(fp, await previousFingerprints(ep)))
    }
    const library = await db().select().from(adLibrary).where(eq(adLibrary.showId, ep.showId))
    const lib = libraryMatches(fp, library)
    cands.push(...lib.ads)
    const merged = mergeCandidates(cands, lib.keep)
    const toCut = merged.filter((c) => c.confidence >= AUTO_CUT_CONFIDENCE)
    for (const c of merged) {
      const startJ = c.start * ITEM_SEC
      const endJ = c.end * ITEM_SEC
      segments.push({
        episodeId: ep.id, startSec: toOriginal(startJ), endSec: toOriginal(endJ), source: c.source,
        confidence: c.confidence, applied: c.confidence >= AUTO_CUT_CONFIDENCE, fingerprint: fpToBuffer(fp.slice(c.start, c.end)),
      })
    }

    // Fingerprint cuts are measured in the joined timeline: mapped back they
    // could straddle an already-removed DAI break.
    const adSeconds = segments.filter((s) => s.source === 'megaphone').reduce((n, s) => n + (s.endSec - s.startSec), 0)
      + toCut.reduce((n, c) => n + (c.end - c.start) * ITEM_SEC, 0)
    if (adSeconds > originalDuration * MAX_AD_SHARE) {
      throw new NeedsReview(`Detected ${Math.round(adSeconds)}s of ads in a ${Math.round(originalDuration)}s file — too much to trust`)
    }

    // Stage 3 — render and verify.
    await setStage(ep.id, 'rendering')
    const staged = join(work, 'out.mp3')
    if (toCut.length) {
      const joinedDuration = fp.length * ITEM_SEC
      const keep = invert(toCut.map((c) => [c.start * ITEM_SEC, c.end * ITEM_SEC]), joinedDuration)
      await cutByTime(joined, keep, staged, work)
    } else {
      await remuxMp3(joined, staged)
    }
    const outputDuration = await probeDuration(staged)
    const expected = originalDuration - adSeconds
    if (Math.abs(outputDuration - expected) > DURATION_TOLERANCE_SEC) {
      throw new NeedsReview(`Output is ${outputDuration.toFixed(1)}s, expected ${expected.toFixed(1)}s`)
    }
    const showDir = join(audioDir(), String(ep.showId))
    await mkdir(showDir, { recursive: true })
    const outPath = join(showDir, `${ep.id}.mp3`)
    await rename(staged, outPath)
    const { size } = await stat(outPath)

    db().transaction((tx) => {
      tx.delete(adSegments).where(eq(adSegments.episodeId, ep.id)).run()
      if (segments.length) tx.insert(adSegments).values(segments).run()
      tx.insert(episodeFingerprints).values({ episodeId: ep.id, fingerprint: fpToBuffer(fp) })
        .onConflictDoUpdate({ target: episodeFingerprints.episodeId, set: { fingerprint: fpToBuffer(fp) } }).run()
      // Learn: newly found ads join the library so they're caught wherever they recur.
      const learned = toCut.filter((c) => !c.libraryIds.length && (c.source === 'diff' || c.source === 'repeat'))
      if (learned.length) {
        tx.insert(adLibrary).values(learned.map((c) => ({
          showId: ep.showId, kind: 'ad' as const, source: c.source,
          fingerprint: fpToBuffer(fp.slice(c.start, c.end)), durationSec: (c.end - c.start) * ITEM_SEC,
        }))).run()
      }
      const hit = [...new Set(toCut.flatMap((c) => c.libraryIds))]
      if (hit.length) tx.update(adLibrary).set({ hits: sql`${adLibrary.hits} + 1` }).where(inArray(adLibrary.id, hit)).run()
      tx.update(episodes).set({
        status: 'done', stage: null, error: null, nextAttemptAt: null, detector: detectors.join('+') || 'library',
        originalBytes: dl.bytes, originalDuration, outputPath: outPath, outputBytes: size,
        outputDuration, adSeconds, processedAt: new Date(),
      }).where(eq(episodes.id, ep.id)).run()
    })
    await Promise.all([enforceRetention(ep.showId), pruneLibrary(ep.showId)])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof NeedsReview) {
      await db().update(episodes).set({ status: 'needs_review', stage: null, error: message }).where(eq(episodes.id, ep.id))
    } else if (ep.attempts >= MAX_ATTEMPTS) {
      await db().update(episodes).set({ status: 'failed', stage: null, error: message }).where(eq(episodes.id, ep.id))
    } else {
      const backoffMin = 5 * 2 ** (ep.attempts - 1)
      await db().update(episodes).set({
        status: 'pending', stage: null, error: message, nextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
      }).where(eq(episodes.id, ep.id))
    }
    throw err
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Fingerprints of the show's most recent other processed episodes. */
async function previousFingerprints(ep: Episode): Promise<Uint32Array[]> {
  const rows = await db().select({ fp: episodeFingerprints.fingerprint })
    .from(episodeFingerprints).innerJoin(episodes, eq(episodes.id, episodeFingerprints.episodeId))
    .where(and(eq(episodes.showId, ep.showId), ne(episodes.id, ep.id)))
    .orderBy(desc(episodes.pubDate)).limit(REPEAT_LOOKBACK)
  return rows.map((r) => fpFromBuffer(r.fp))
}

/** Keeps the library bounded: the least useful 'ad' entries beyond LIBRARY_CAP go. */
async function pruneLibrary(showId: number): Promise<void> {
  db().run(sql`
    DELETE FROM ad_library WHERE id IN (
      SELECT id FROM ad_library WHERE show_id = ${showId} AND kind = 'ad'
      ORDER BY hits DESC, created_at DESC LIMIT -1 OFFSET ${LIBRARY_CAP}
    )`)
}

/** Deletes audio beyond the newest RETENTION_PER_SHOW published episodes. */
export async function enforceRetention(showId: number): Promise<void> {
  const done = await db().select({ id: episodes.id, outputPath: episodes.outputPath })
    .from(episodes).where(and(eq(episodes.showId, showId), eq(episodes.status, 'done')))
    .orderBy(desc(episodes.pubDate))
  const old = done.slice(RETENTION_PER_SHOW)
  if (!old.length) return
  for (const e of old) if (e.outputPath) await rm(e.outputPath, { force: true })
  await db().update(episodes).set({ status: 'expired', outputPath: null })
    .where(inArray(episodes.id, old.map((e) => e.id)))
}

/** Put an episode (back) in the queue now. */
export async function enqueue(id: number): Promise<void> {
  await db().update(episodes).set({ status: 'pending', stage: null, error: null, attempts: 0, nextAttemptAt: null })
    .where(eq(episodes.id, id))
}
