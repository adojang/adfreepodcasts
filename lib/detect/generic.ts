// Host-agnostic, token-free ad detection on Chromaprint fingerprints:
//  - diff:    audio present in this download but not in a second download of
//             the same episode (dynamic ad insertion serves different fills)
//  - repeat:  audio shared with the show's recent episodes (network promos,
//             recurring sponsor spots) — episode content doesn't repeat
//  - library: audio matching an 'ad' entry learned earlier or marked by hand
// 'keep' library entries ("not an ad") veto overlapping candidates.

import type { AdSource, LibraryEntry } from '@/lib/db/schema'
import { ITEM_SEC, coverage, findMatches, fpFromBuffer, gaps } from './fingerprint'

export interface Candidate {
  /** item indices into the analysed file's fingerprint, [start, end) */
  start: number
  end: number
  source: AdSource
  confidence: number
  libraryIds: number[]
}

export const AUTO_CUT_CONFIDENCE = 0.9

const sec = (s: number) => Math.round(s / ITEM_SEC)
const DIFF_MIN = sec(8)
const DIFF_MAX = sec(180)
const REPEAT_MIN = sec(10)
const REPEAT_CONFIDENT = sec(15)
/** A longer shared stretch means a rerun or recap, not an ad break. */
const REPEAT_MAX = sec(300)
/** Below this much overlap the second download isn't the same episode. */
const DIFF_MIN_COVERAGE = 0.5

const len = (iv: Array<[number, number]>) => iv.reduce((n, [s, e]) => n + e - s, 0)

export function diffCandidates(a: Uint32Array, b: Uint32Array): Candidate[] {
  const cov = coverage(findMatches(a, b))
  if (len(cov) < a.length * DIFF_MIN_COVERAGE) return []
  return gaps(cov, a.length)
    .filter(([s, e]) => e - s >= DIFF_MIN && e - s <= DIFF_MAX)
    .map(([start, end]) => ({ start, end, source: 'diff' as const, confidence: 0.95, libraryIds: [] }))
}

export function repeatCandidates(a: Uint32Array, previous: Uint32Array[]): Candidate[] {
  const out: Candidate[] = []
  for (const p of previous) {
    for (const [start, end] of coverage(findMatches(a, p))) {
      const n = end - start
      if (n < REPEAT_MIN || n > REPEAT_MAX) continue
      out.push({ start, end, source: 'repeat', confidence: n >= REPEAT_CONFIDENT ? 0.9 : 0.6, libraryIds: [] })
    }
  }
  return out
}

export function libraryMatches(a: Uint32Array, entries: LibraryEntry[]): { ads: Candidate[]; keep: Array<[number, number]> } {
  const ads: Candidate[] = []
  const keep: Array<[number, number]> = []
  for (const entry of entries) {
    const e = fpFromBuffer(entry.fingerprint)
    const minItems = Math.max(40, Math.floor(e.length * 0.6))
    // A partial match pins the entry's offset; project the whole entry from
    // it (fingerprint edges of a short clip are unreliable, so matches alone
    // stop a few seconds short).
    const projected = findMatches(a, e, { minItems }).map((m) => ({
      aStart: Math.max(0, -m.offset), aEnd: Math.min(a.length, e.length - m.offset), offset: m.offset,
    }))
    for (const [start, end] of coverage(projected)) {
      if (entry.kind === 'keep') keep.push([start, end])
      else ads.push({ start, end, source: entry.source === 'manual' ? 'manual' : 'library', confidence: 0.95, libraryIds: [entry.id] })
    }
  }
  return { ads, keep }
}

/** Unions overlapping candidates (highest confidence wins) and drops any mostly covered by a keep range. */
export function mergeCandidates(cands: Candidate[], keep: Array<[number, number]> = []): Candidate[] {
  const sorted = [...cands].sort((x, y) => x.start - y.start)
  const merged: Candidate[] = []
  for (const c of sorted) {
    const last = merged.at(-1)
    if (last && c.start <= last.end) {
      last.end = Math.max(last.end, c.end)
      if (c.confidence > last.confidence) { last.confidence = c.confidence; last.source = c.source }
      last.libraryIds = [...new Set([...last.libraryIds, ...c.libraryIds])]
    } else {
      merged.push({ ...c, libraryIds: [...c.libraryIds] })
    }
  }
  return merged.filter((c) => {
    const vetoed = keep.reduce((n, [s, e]) => n + Math.max(0, Math.min(e, c.end) - Math.max(s, c.start)), 0)
    return vetoed < (c.end - c.start) * 0.5
  })
}
