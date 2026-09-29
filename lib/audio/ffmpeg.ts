import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)))
  })
}

export async function probeDuration(path: string): Promise<number> {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
  const d = Number(out.trim())
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe: no duration for ${path}`)
  return d
}

/** Reads `len` bytes at each offset. */
export async function readAt(path: string, offsets: number[], len: number): Promise<Uint8Array[]> {
  const fh = await open(path, 'r')
  try {
    return await Promise.all(offsets.map(async (o) => {
      const buf = Buffer.alloc(len)
      const { bytesRead } = await fh.read(buf, 0, len, o)
      return buf.subarray(0, bytesRead)
    }))
  } finally {
    await fh.close()
  }
}

/** Concatenates byte ranges [start,end) of `src` into `dest`. */
export async function concatByteRanges(src: string, ranges: Array<[number, number]>, dest: string): Promise<void> {
  const out = createWriteStream(dest)
  for (const [start, end] of ranges) {
    if (end <= start) continue
    const input = createReadStream(src, { start, end: end - 1 })
    for await (const chunk of input) {
      if (!out.write(chunk)) await once(out, 'drain')
    }
  }
  out.end()
  await once(out, 'finish')
}

/**
 * Re-muxes an MP3 without re-encoding so the Xing/LAME header (duration,
 * seek table) describes the cut file rather than the original.
 */
export async function remuxMp3(src: string, dest: string): Promise<void> {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    '-map', '0:a', '-c', 'copy', '-map_metadata', '0', '-id3v2_version', '3', '-write_xing', '1', dest,
  ])
}

/** Keeps the given [start,end) second ranges of `src`, joined with stream copy. */
export async function cutByTime(src: string, keep: Array<[number, number]>, dest: string, workDir: string): Promise<void> {
  const parts: string[] = []
  try {
    for (const [i, [s, e]] of keep.entries()) {
      const part = `${workDir}/part-${i}.mp3`
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(s), '-i', src, '-t', String(e - s), '-map', '0:a', '-c', 'copy', part])
      parts.push(part)
    }
    const list = `${workDir}/concat.txt`
    await writeFile(list, parts.map((p) => `file '${p}'`).join('\n'))
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', src,
      '-map', '0:a', '-map_metadata', '1', '-c', 'copy', '-id3v2_version', '3', '-write_xing', '1', dest])
  } finally {
    await Promise.all(parts.map((p) => rm(p, { force: true })))
  }
}
