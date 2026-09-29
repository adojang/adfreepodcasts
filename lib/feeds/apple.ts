/** Extracts the numeric show id from an Apple Podcasts URL (or a bare id). */
export function parseAppleId(input: string): string | null {
  const s = input.trim()
  if (/^\d+$/.test(s)) return s
  let url: URL
  try { url = new URL(s) } catch { return null }
  if (!/(^|\.)(podcasts|itunes)\.apple\.com$/.test(url.hostname)) return null
  const m = url.pathname.match(/\/id(\d+)/) ?? url.search.match(/[?&]id=(\d+)/)
  return m ? m[1] : null
}

export interface AppleLookup {
  appleId: string
  feedUrl: string
  title: string
  artworkUrl?: string
}

export async function lookupApple(appleId: string): Promise<AppleLookup> {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${appleId}&entity=podcast`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`iTunes lookup failed: HTTP ${res.status}`)
  const json = (await res.json()) as { results?: Array<Record<string, unknown>> }
  const r = json.results?.find((x) => x.feedUrl)
  if (!r) throw new Error('Apple has no public RSS feed for that show (Apple-exclusive or subscriber-only shows cannot be followed)')
  return {
    appleId,
    feedUrl: String(r.feedUrl),
    title: String(r.collectionName ?? r.trackName ?? ''),
    artworkUrl: (r.artworkUrl600 as string | undefined) ?? undefined,
  }
}
