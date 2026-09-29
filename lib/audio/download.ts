import { createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

// A normal podcast-app UA: some hosts serve a different (or no) ad load and
// omit DAI metadata for unknown clients.
export const PODCAST_UA = 'AppleCoreMedia/1.0.0.21A329 (iPhone; U; CPU OS 17_0 like Mac OS X; en_us)'

export interface Download {
  path: string
  finalUrl: string
  bytes: number
  headers: Headers
}

/** Streams the enclosure to `dest`. Headers come from the SAME response as the body — DAI ad loads differ per request. */
export async function downloadEpisode(url: string, dest: string, userAgent = PODCAST_UA): Promise<Download> {
  const res = await fetch(url, {
    headers: { 'user-agent': userAgent, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(dest))
  const { size } = await stat(dest)
  const expected = Number(res.headers.get('content-length'))
  if (expected && expected !== size) throw new Error(`Truncated download: got ${size} of ${expected} bytes`)
  return { path: dest, finalUrl: res.url, bytes: size, headers: res.headers }
}
