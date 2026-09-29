// Background worker, started inside the Next.js server (instrumentation.ts):
// polls every active show's RSS on an interval and processes queued episodes
// one at a time. Set WORKER=off to run the web UI without it.
import { mkdir } from 'node:fs/promises'
import { audioDir, POLL_INTERVAL_MS, tmpDir } from '@/lib/env'
import { claimNext, processEpisode, requeueStale } from '@/lib/pipeline'
import { pollAll } from '@/lib/shows'

const IDLE_MS = 20_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const g = globalThis as unknown as { __podcastWorker?: boolean }

async function pollLoop() {
  for (;;) {
    try { await pollAll() } catch (err) { console.error('[poll] loop error', err) }
    await sleep(POLL_INTERVAL_MS)
  }
}

async function jobLoop() {
  for (;;) {
    let ep = null
    try { ep = await claimNext() } catch (err) { console.error('[jobs] claim failed', err) }
    if (!ep) { await sleep(IDLE_MS); continue }
    const t0 = Date.now()
    console.log(`[jobs] #${ep.id} "${ep.title}" (attempt ${ep.attempts})`)
    try {
      await processEpisode(ep)
      console.log(`[jobs] #${ep.id} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    } catch (err) {
      console.error(`[jobs] #${ep.id} ${err instanceof Error ? err.message : err}`)
    }
  }
}

export async function startWorker(): Promise<void> {
  if (g.__podcastWorker || process.env.WORKER === 'off') return
  g.__podcastWorker = true
  await mkdir(audioDir(), { recursive: true })
  await mkdir(tmpDir(), { recursive: true })
  await requeueStale()
  console.log(`[worker] started; polling every ${POLL_INTERVAL_MS / 60_000} min`)
  void pollLoop()
  void jobLoop()
}
