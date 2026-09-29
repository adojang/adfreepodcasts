import { XMLParser } from 'fast-xml-parser'

export interface ParsedChannel {
  title: string
  author?: string
  description?: string
  artworkUrl?: string
  link?: string
  language?: string
  categories: string[]
  explicit: boolean
  items: ParsedItem[]
}

export interface ParsedItem {
  guid: string
  title: string
  description?: string
  link?: string
  imageUrl?: string
  pubDate: Date
  enclosureUrl: string
  season?: number
  episodeNumber?: number
  episodeType?: string
  explicit: boolean
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ['item', 'itunes:category', 'category'].includes(name),
})

type Node = Record<string, unknown>

function text(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text((v as Node)['#text'])
  return undefined
}
const attr = (v: unknown, name: string) =>
  v && typeof v === 'object' && !Array.isArray(v) ? text((v as Node)[`@_${name}`]) : undefined
const int = (v: unknown) => {
  const n = Number(text(v))
  return Number.isInteger(n) ? n : undefined
}
const isExplicit = (v: unknown) => ['yes', 'true', 'explicit'].includes((text(v) ?? '').toLowerCase())

function categoriesOf(ch: Node): string[] {
  const out: string[] = []
  const walk = (list: unknown) => {
    for (const c of (Array.isArray(list) ? list : []) as Node[]) {
      const t = attr(c, 'text')
      if (t) out.push(t)
      if (c['itunes:category']) walk(c['itunes:category'])
    }
  }
  walk(ch['itunes:category'])
  return [...new Set(out)]
}

export function parseFeed(xml: string): ParsedChannel {
  const doc = parser.parse(xml) as Node
  const ch = (doc.rss as Node | undefined)?.channel as Node | undefined
  if (!ch) throw new Error('Not an RSS podcast feed (no rss/channel)')

  const items: ParsedItem[] = []
  for (const it of (ch.item ?? []) as Node[]) {
    const enclosureUrl = attr(it.enclosure, 'url')
    if (!enclosureUrl) continue
    const pub = new Date(text(it.pubDate) ?? '')
    items.push({
      guid: text(it.guid) ?? enclosureUrl,
      title: text(it.title) ?? text(it['itunes:title']) ?? 'Untitled',
      description: text(it['content:encoded']) ?? text(it.description) ?? text(it['itunes:summary']),
      link: text(it.link),
      imageUrl: attr(it['itunes:image'], 'href'),
      pubDate: Number.isNaN(pub.getTime()) ? new Date(0) : pub,
      enclosureUrl,
      season: int(it['itunes:season']),
      episodeNumber: int(it['itunes:episode']),
      episodeType: text(it['itunes:episodeType']),
      explicit: isExplicit(it['itunes:explicit']),
    })
  }
  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())

  return {
    title: text(ch.title) ?? 'Untitled podcast',
    author: text(ch['itunes:author']) ?? text(ch.author),
    description: text(ch.description) ?? text(ch['itunes:summary']),
    artworkUrl: attr(ch['itunes:image'], 'href') ?? text((ch.image as Node | undefined)?.url),
    link: text(ch.link),
    language: text(ch.language),
    categories: categoriesOf(ch),
    explicit: isExplicit(ch['itunes:explicit']),
    items,
  }
}

export async function fetchFeed(url: string): Promise<ParsedChannel> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'ArdwellPodcast/1.0' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Feed fetch failed: HTTP ${res.status}`)
  return parseFeed(await res.text())
}
