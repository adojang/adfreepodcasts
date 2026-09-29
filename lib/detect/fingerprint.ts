// Token-free audio matching on Chromaprint fingerprints (ffmpeg's built-in
// chromaprint muxer, raw 32-bit sub-fingerprints ≈ 0.124 s apart).
//
// Matching is a brute-force diagonal scan: for every relative offset between
// two fingerprints, slide a window of bit-error counts along that diagonal
// and keep stretches whose mean Hamming distance is well below chance (16/32).
// O(nA·nB) popcounts — ~150M for two 25-minute episodes, about a second.

import { spawn } from 'node:child_process'

/** Seconds per chromaprint item (default algorithm: 11025 Hz, hop 4096/3). */
export const ITEM_SEC = 4096 / 3 / 11025

export async function fingerprint(path: string): Promise<Uint32Array> {
  const buf = await new Promise<Buffer>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-ac', '1', '-f', 'chromaprint', '-fp_format', 'raw', '-'])
    const chunks: Buffer[] = []
    let err = ''
    p.stdout.on('data', (d: Buffer) => chunks.push(d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`chromaprint failed: ${err.slice(-400)}`))))
  })
  const out = new Uint32Array(Math.floor(buf.length / 4))
  for (let i = 0; i < out.length; i++) out[i] = buf.readUInt32LE(i * 4)
  return out
}

export const fpToBuffer = (fp: Uint32Array) => Buffer.from(fp.buffer, fp.byteOffset, fp.byteLength)
export const fpFromBuffer = (b: Buffer) => new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/** An item at a match edge must be at least this close to count. */
const EDGE_BIT_ERRORS = 8

export interface Match {
  /** item index range in A, [start, end) */
  aStart: number
  aEnd: number
  /** B index = A index + offset */
  offset: number
}

export interface MatchOptions {
  /** window length in items */
  window?: number
  /** max mean bit errors per item inside a matching window */
  maxBitErrors?: number
  /** shortest match kept, in items */
  minItems?: number
}

/** All stretches of A that also occur somewhere in B. */
export function findMatches(a: Uint32Array, b: Uint32Array, opts: MatchOptions = {}): Match[] {
  const W = opts.window ?? 16
  const thr = (opts.maxBitErrors ?? 9) * W
  const minItems = opts.minItems ?? 40
  const nA = a.length
  const nB = b.length
  const out: Match[] = []
  const err = new Uint8Array(Math.max(nA, 1))

  for (let d = -(nA - W); d <= nB - W; d++) {
    const i0 = Math.max(0, -d)
    const i1 = Math.min(nA, nB - d)
    const len = i1 - i0
    if (len < minItems) continue
    for (let k = 0; k < len; k++) err[k] = popcount(a[i0 + k] ^ b[i0 + k + d])

    // Sliding-window sum; a window that matches marks all its items matched,
    // then the run's edges are trimmed back to items that match on their own
    // (the window otherwise bleeds up to W items past a real boundary).
    const emit = (s: number, e: number) => {
      while (s < e && err[s] > EDGE_BIT_ERRORS) s++
      while (e > s && err[e - 1] > EDGE_BIT_ERRORS) e--
      if (e - s >= minItems) out.push({ aStart: i0 + s, aEnd: i0 + e, offset: d })
    }
    let sum = 0
    for (let k = 0; k < W; k++) sum += err[k]
    let runStart = -1
    let runEnd = -1
    for (let k = 0; k + W <= len; k++) {
      if (k > 0) sum += err[k + W - 1] - err[k - 1]
      if (sum <= thr) {
        if (runStart < 0 || k > runEnd) {
          if (runStart >= 0) emit(runStart, runEnd)
          runStart = k
        }
        runEnd = k + W
      }
    }
    if (runStart >= 0) emit(runStart, runEnd)
  }
  return out
}

/** Merged [start,end) item intervals of A covered by any match. */
export function coverage(matches: Match[]): Array<[number, number]> {
  const iv = matches.map((m) => [m.aStart, m.aEnd] as [number, number]).sort((x, y) => x[0] - y[0])
  const merged: Array<[number, number]> = []
  for (const [s, e] of iv) {
    const last = merged.at(-1)
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged
}

/** Gaps in [0,n) not covered by `covered`. */
export function gaps(covered: Array<[number, number]>, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let cursor = 0
  for (const [s, e] of covered) {
    if (s > cursor) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < n) out.push([cursor, n])
  return out
}

