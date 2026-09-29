import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  boundaryOffsets, byteToSeconds, isFrameSync, keptRanges, parseMegaphonePayload, validateRanges,
} from '@/lib/detect/megaphone'

const fixture = (id: string) => ({
  header: readFileSync(join(__dirname, 'fixtures', `hdr-${id}.payload2`), 'utf8').trim(),
  size: Number(readFileSync(join(__dirname, 'fixtures', `hdr-${id}.size`), 'utf8').trim()),
})

describe('parseMegaphonePayload', () => {
  it('parses a real header with pre, mid and post rolls', () => {
    const { header, size } = fixture('CTL8612437951')
    const p = parseMegaphonePayload(header)
    expect(p.bitrate).toBe(256000)
    expect(p.audioStart).toBe(105403)
    expect(p.ads.map((a) => a.position)).toEqual(['pre', 'mid', 'mid', 'post', 'post', 'post', 'post', 'post'])
    expect(p.ads[0]).toMatchObject({ start: 105403, end: 1280706 })
    // last post-roll runs to end of file
    expect(p.ads.at(-1)!.end).toBe(size)
    validateRanges(p, size)
  })

  it('skips empty slots (no pre-roll filled)', () => {
    const { header, size } = fixture('CTL4031131835')
    const p = parseMegaphonePayload(header)
    expect(p.ads[0].position).toBe('mid')
    expect(p.ads[0].start).toBe(19087464)
    validateRanges(p, size)
  })

  it('computes kept ranges that exclude every ad', () => {
    const { header, size } = fixture('CTL2149538380')
    const p = parseMegaphonePayload(header)
    const kept = keptRanges(p, size)
    expect(kept[0]).toEqual([0, 105481]) // ID3 tag kept
    const keptBytes = kept.reduce((n, [s, e]) => n + e - s, 0)
    const adBytes = p.ads.reduce((n, a) => n + a.end - a.start, 0)
    expect(keptBytes + adBytes).toBe(size)
    for (const [s, e] of kept) for (const a of p.ads) expect(e <= a.start || s >= a.end).toBe(true)
    // ~36.7s pre-roll at 256kbps
    expect(byteToSeconds(p, p.ads[0].end)).toBeCloseTo(36.7, 0)
    expect(boundaryOffsets(p, size)).not.toContain(size)
  })

  it('rejects malformed headers', () => {
    expect(() => parseMegaphonePayload('garbage')).toThrow()
    expect(() => parseMegaphonePayload('a#10#weird#1#0#c#false#false@g#256000#0')).toThrow()
    expect(() => parseMegaphonePayload('a#5#mid#1#10#c#false#false@g#256000#0')).toThrow()
  })

  it('rejects ranges past the file end', () => {
    const p = parseMegaphonePayload('a#999#post#1#100#c#false#false@g#256000#10')
    expect(() => validateRanges(p, 500)).toThrow()
  })
})

describe('isFrameSync', () => {
  it('detects MPEG frame headers', () => {
    expect(isFrameSync(Uint8Array.from([0xff, 0xfb, 0xd2]), 0)).toBe(true)
    expect(isFrameSync(Uint8Array.from([0x49, 0x44, 0x33]), 0)).toBe(false)
  })
})
