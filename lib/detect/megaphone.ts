// Megaphone (Spotify) dynamic ad insertion reports every inserted ad's byte
// range in the `x-megaphone-payload-2` response header of the final
// (post-redirect) audio GET. Undocumented, so parsing is strict and any
// surprise throws — the pipeline then parks the episode in needs_review
// instead of publishing it with ads.
//
// Format: comma-separated slots, then `@<episodeGuid>#<bitrate>#<audioStart>`.
//   filled slot: <adId>#<endByteInclusive>#<pre|mid|post>#<slotNo>#<startByte>#<creativeId>#false#false
//   empty slot:  #<end>#<pos>#<slotNo>#<end+1>###   (start > end → zero length)

export const MEGAPHONE_HEADER = 'x-megaphone-payload-2'

export type AdPosition = 'pre' | 'mid' | 'post'

export interface MegaphoneAd {
  adId: string
  creativeId: string
  position: AdPosition
  slot: number
  /** inclusive start byte */
  start: number
  /** exclusive end byte */
  end: number
}

export interface MegaphonePayload {
  episodeGuid: string
  bitrate: number
  audioStart: number
  ads: MegaphoneAd[]
}

export function parseMegaphonePayload(header: string): MegaphonePayload {
  const at = header.lastIndexOf('@')
  if (at < 0) throw new Error('megaphone payload: missing @ trailer')
  const [episodeGuid, bitrateStr, audioStartStr] = header.slice(at + 1).split('#')
  const bitrate = Number(bitrateStr)
  const audioStart = Number(audioStartStr)
  if (!episodeGuid || !Number.isInteger(bitrate) || bitrate <= 0 || !Number.isInteger(audioStart) || audioStart < 0) {
    throw new Error(`megaphone payload: bad trailer "${header.slice(at + 1)}"`)
  }

  const ads: MegaphoneAd[] = []
  const body = header.slice(0, at)
  for (const raw of body ? body.split(',') : []) {
    const f = raw.split('#')
    if (f.length !== 8) throw new Error(`megaphone payload: bad slot "${raw}"`)
    const [adId, endStr, position, slotStr, startStr, creativeId] = f
    if (position !== 'pre' && position !== 'mid' && position !== 'post') {
      throw new Error(`megaphone payload: unknown position "${position}"`)
    }
    if (!adId) continue // empty slot
    const start = Number(startStr)
    const endInclusive = Number(endStr)
    if (!Number.isInteger(start) || !Number.isInteger(endInclusive) || endInclusive < start) {
      throw new Error(`megaphone payload: bad range in "${raw}"`)
    }
    ads.push({ adId, creativeId, position, slot: Number(slotStr), start, end: endInclusive + 1 })
  }
  ads.sort((a, b) => a.start - b.start)
  return { episodeGuid, bitrate, audioStart, ads }
}

/** Throws unless ranges are sorted, non-overlapping, after the ID3 tag and inside the file. */
export function validateRanges(p: MegaphonePayload, fileSize: number): void {
  let prevEnd = p.audioStart
  for (const ad of p.ads) {
    if (ad.start < prevEnd) throw new Error(`megaphone payload: overlapping/pre-audio range at ${ad.start}`)
    if (ad.end > fileSize) throw new Error(`megaphone payload: range ${ad.start}-${ad.end} beyond file size ${fileSize}`)
    prevEnd = ad.end
  }
}

/** MPEG audio frame sync: 11 set bits. */
export function isFrameSync(buf: Uint8Array, offset: number): boolean {
  return offset + 1 < buf.length && buf[offset] === 0xff && (buf[offset + 1] & 0xe0) === 0xe0
}

/** Byte offsets that must each start an MP3 frame for the cuts to be clean. */
export function boundaryOffsets(p: MegaphonePayload, fileSize: number): number[] {
  const out = new Set<number>()
  for (const ad of p.ads) {
    out.add(ad.start)
    if (ad.end < fileSize) out.add(ad.end)
  }
  return [...out].sort((a, b) => a - b)
}

/** Byte ranges to KEEP ([start, end) pairs): ID3 tag + everything that isn't an ad. */
export function keptRanges(p: MegaphonePayload, fileSize: number): Array<[number, number]> {
  const kept: Array<[number, number]> = []
  let cursor = 0
  for (const ad of p.ads) {
    if (ad.start > cursor) kept.push([cursor, ad.start])
    cursor = ad.end
  }
  if (cursor < fileSize) kept.push([cursor, fileSize])
  return kept
}

/** Approximate playback second for a byte offset (Megaphone serves CBR). */
export function byteToSeconds(p: MegaphonePayload, byte: number): number {
  return Math.max(0, byte - p.audioStart) * 8 / p.bitrate
}
