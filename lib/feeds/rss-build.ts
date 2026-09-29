import type { Episode, Show } from '@/lib/db/schema'

import { feedTitlePrefix } from '@/lib/env'

export const afTitle = (title: string) => `${feedTitlePrefix()}${title}`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

export function formatDuration(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(s % 60)}`
}

export interface FeedUrls {
  self: string
  audio: (e: Episode) => string
}

export function buildFeed(show: Show, eps: Episode[], urls: FeedUrls): string {
  const cats = show.categories.map((c) => `    <itunes:category text="${esc(c)}"/>`).join('\n')
  const items = eps.map((e) => {
    const lines = [
      `      <title>${esc(e.title)}</title>`,
      `      <itunes:title>${esc(e.title)}</itunes:title>`,
      `      <guid isPermaLink="false">${esc(e.guid)}</guid>`,
      `      <pubDate>${e.pubDate.toUTCString()}</pubDate>`,
      `      <enclosure url="${esc(urls.audio(e))}" length="${e.outputBytes ?? 0}" type="audio/mpeg"/>`,
      `      <itunes:duration>${formatDuration(e.outputDuration ?? 0)}</itunes:duration>`,
      `      <itunes:explicit>${e.explicit ? 'true' : 'false'}</itunes:explicit>`,
    ]
    if (e.description) {
      lines.push(`      <description>${cdata(e.description)}</description>`)
      lines.push(`      <content:encoded>${cdata(e.description)}</content:encoded>`)
    }
    if (e.link) lines.push(`      <link>${esc(e.link)}</link>`)
    if (e.imageUrl) lines.push(`      <itunes:image href="${esc(e.imageUrl)}"/>`)
    if (e.season != null) lines.push(`      <itunes:season>${e.season}</itunes:season>`)
    if (e.episodeNumber != null) lines.push(`      <itunes:episode>${e.episodeNumber}</itunes:episode>`)
    if (e.episodeType) lines.push(`      <itunes:episodeType>${esc(e.episodeType)}</itunes:episodeType>`)
    return `    <item>\n${lines.join('\n')}\n    </item>`
  })

  const title = esc(afTitle(show.title))
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <atom:link href="${esc(urls.self)}" rel="self" type="application/rss+xml"/>
    <link>${esc(show.link ?? urls.self)}</link>
    <language>${esc(show.language ?? 'en')}</language>
    <description>${cdata(show.description ?? '')}</description>
    <itunes:author>${esc(show.author ?? '')}</itunes:author>
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:block>Yes</itunes:block>
${show.artworkUrl ? `    <itunes:image href="${esc(show.artworkUrl)}"/>\n    <image><url>${esc(show.artworkUrl)}</url><title>${title}</title><link>${esc(show.link ?? urls.self)}</link></image>\n` : ''}${cats}
${items.join('\n')}
  </channel>
</rss>
`
}
