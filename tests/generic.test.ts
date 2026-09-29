import { describe, expect, it } from 'vitest'
import { coverage, findMatches, gaps, ITEM_SEC } from '@/lib/detect/fingerprint'
import { diffCandidates, mergeCandidates, repeatCandidates } from '@/lib/detect/generic'

// Deterministic pseudo-random "audio" fingerprints.
function rand(seed: number, n: number): Uint32Array {
  const out = new Uint32Array(n)
  let x = seed >>> 0 || 1
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0
    out[i] = x
  }
  return out
}
const cat = (...parts: Uint32Array[]) => {
  const out = new Uint32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
/** Flip a few bits per item, like a re-aligned decode of the same audio. */
const noisy = (fp: Uint32Array, seed: number) => {
  const r = rand(seed, fp.length)
  return fp.map((v, i) => v ^ (r[i] & r[i] >>> 7 & r[i] >>> 13 & 0x0f0f0f0f))
}
const s = (sec: number) => Math.round(sec / ITEM_SEC)

const content1 = rand(1, s(300))
const content2 = rand(2, s(400))
const adX = rand(3, s(30))
const adY = rand(4, s(45))
const promo = rand(5, s(60))

describe('findMatches', () => {
  it('finds shared audio despite bit noise and gaps where it differs', () => {
    const a = cat(content1, adX, content2)
    const b = noisy(cat(content1, adY, content2), 9)
    const g = gaps(coverage(findMatches(a, b)), a.length)
    expect(g).toHaveLength(1)
    expect(Math.abs(g[0][0] - content1.length)).toBeLessThan(3)
    expect(Math.abs(g[0][1] - (content1.length + adX.length))).toBeLessThan(3)
  })
})

describe('diffCandidates', () => {
  it('flags audio unique to the first download', () => {
    const a = cat(adX, content1, promo, content2)
    const b = noisy(cat(content1, promo, adY, content2), 11)
    const c = diffCandidates(a, b)
    expect(c).toHaveLength(1)
    expect(c[0].start).toBe(0)
    expect(Math.abs(c[0].end - adX.length)).toBeLessThan(3)
  })

  it('refuses when the second download is a different episode', () => {
    expect(diffCandidates(cat(content1, content2), rand(99, s(700)))).toEqual([])
  })
})

describe('repeatCandidates', () => {
  it('flags a promo shared with a previous episode', () => {
    const ep1 = cat(content1, promo, content2)
    const ep0 = noisy(cat(rand(7, s(200)), promo, rand(8, s(500))), 12)
    const c = repeatCandidates(ep1, [ep0])
    expect(c).toHaveLength(1)
    expect(c[0].confidence).toBeGreaterThanOrEqual(0.9)
    expect(Math.abs(c[0].start - content1.length)).toBeLessThan(3)
  })

  it('ignores a rerun (long repeated stretch)', () => {
    const ep = cat(content1, content2)
    expect(repeatCandidates(ep, [noisy(ep, 13)])).toEqual([])
  })
})

describe('mergeCandidates', () => {
  it('unions overlaps and honours keep vetoes', () => {
    const merged = mergeCandidates([
      { start: 0, end: 100, source: 'repeat', confidence: 0.6, libraryIds: [] },
      { start: 50, end: 200, source: 'diff', confidence: 0.95, libraryIds: [] },
      { start: 500, end: 600, source: 'repeat', confidence: 0.9, libraryIds: [] },
    ], [[490, 600]])
    expect(merged).toEqual([{ start: 0, end: 200, source: 'diff', confidence: 0.95, libraryIds: [] }])
  })
})

describe('timeline helpers', async () => {
  const { invert, timelineMapper } = await import('@/lib/audio/timeline')
  it('maps joined seconds back across removed ranges', () => {
    const map = timelineMapper([[0, 0], [36.7, 505.4], [613.2, 1340.4]])
    expect(map(0)).toBeCloseTo(36.7)
    expect(map(468.7)).toBeCloseTo(505.4)
    expect(map(470)).toBeCloseTo(614.5)
  })
  it('inverts cut ranges into keep ranges', () => {
    expect(invert([[0, 10], [50, 60]], 100)).toEqual([[10, 50], [60, 100]])
  })
})

describe('libraryMatches', async () => {
  const { libraryMatches } = await import('@/lib/detect/generic')
  const { fpToBuffer } = await import('@/lib/detect/fingerprint')
  it('projects the full library entry even when its edges match poorly', () => {
    const ep = cat(content1, promo, content2)
    // entry whose first and last 2s are garbage (clip edge effects)
    const entry = cat(rand(21, s(2)), promo.slice(s(2), promo.length - s(2)), rand(22, s(2)))
    const row = { id: 1, showId: 1, kind: 'ad' as const, source: 'manual' as const, fingerprint: fpToBuffer(entry), durationSec: 60, hits: 0, createdAt: new Date() }
    const { ads } = libraryMatches(ep, [row])
    expect(ads).toHaveLength(1)
    expect(Math.abs(ads[0].start - content1.length)).toBeLessThan(3)
    expect(Math.abs(ads[0].end - (content1.length + promo.length))).toBeLessThan(3)
  })
})
