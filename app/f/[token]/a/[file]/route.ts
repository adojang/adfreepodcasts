import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import { db, episodes } from '@/lib/db'
import { tokenOk } from '@/lib/feed-access'

export const dynamic = 'force-dynamic'

async function locate(ctx: RouteContext<'/f/[token]/a/[file]'>) {
  const { token, file } = await ctx.params
  const m = file.match(/^(\d+)\.mp3$/)
  if (!tokenOk(token) || !m) return null
  const ep = await db().query.episodes.findFirst({ where: eq(episodes.id, Number(m[1])) })
  if (!ep?.outputPath || ep.status !== 'done') return null
  try {
    return { path: ep.outputPath, size: (await stat(ep.outputPath)).size }
  } catch {
    return null
  }
}

const baseHeaders = (size: number) => ({
  'content-type': 'audio/mpeg',
  'accept-ranges': 'bytes',
  'cache-control': 'private, max-age=86400',
  'content-length': String(size),
})

export async function HEAD(_req: Request, ctx: RouteContext<'/f/[token]/a/[file]'>) {
  const f = await locate(ctx)
  if (!f) return new Response(null, { status: 404 })
  return new Response(null, { headers: baseHeaders(f.size) })
}

export async function GET(req: Request, ctx: RouteContext<'/f/[token]/a/[file]'>) {
  const f = await locate(ctx)
  if (!f) return new Response('Not found', { status: 404 })

  const range = req.headers.get('range')
  const m = range?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (!m[1] && !m[2])) {
    return new Response(stream(f.path, 0, f.size - 1), { headers: baseHeaders(f.size) })
  }

  let start: number
  let end: number
  if (!m[1]) { // suffix range: last N bytes
    start = Math.max(0, f.size - Number(m[2]))
    end = f.size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), f.size - 1) : f.size - 1
  }
  if (start > end || start >= f.size) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${f.size}` } })
  }
  return new Response(stream(f.path, start, end), {
    status: 206,
    headers: { ...baseHeaders(end - start + 1), 'content-range': `bytes ${start}-${end}/${f.size}` },
  })
}

function stream(path: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
}
