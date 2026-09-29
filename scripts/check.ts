// `pnpm check` — checks everything an install needs and says how to fix
// what's missing. Exit code 1 if anything required is broken.
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, mkdirSync, statfsSync } from 'node:fs'
import { MIN_PASSWORD_LENGTH, allowedEmails, dataDir, oidcEnabled } from '@/lib/env'

let failed = false
const ok = (msg: string) => console.log(`  ✔ ${msg}`)
const warn = (msg: string) => console.log(`  ! ${msg}`)
const fail = (msg: string, fix: string) => { failed = true; console.log(`  ✖ ${msg}\n      → ${fix}`) }

function tool(name: string): string | null {
  const r = spawnSync(name, ['-hide_banner', '-version'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split('\n')[0] : null
}

async function main() {
  console.log('\nArdwell Podcast — install check\n')

  console.log('System')
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 20) ok(`Node ${process.versions.node}`)
  else fail(`Node ${process.versions.node} is too old`, 'Install Node 20 or newer (https://nodejs.org or nvm)')

  const ffmpeg = tool('ffmpeg')
  if (!ffmpeg) fail('ffmpeg not found', 'Install ffmpeg: Debian/Ubuntu `sudo apt install ffmpeg`, macOS `brew install ffmpeg`')
  else {
    ok(ffmpeg)
    const muxers = spawnSync('ffmpeg', ['-hide_banner', '-muxers'], { encoding: 'utf8' }).stdout ?? ''
    if (/\bchromaprint\b/.test(muxers)) ok('ffmpeg has Chromaprint (audio fingerprinting)')
    else fail('ffmpeg was built without Chromaprint', 'Use a build with --enable-chromaprint (Debian/Ubuntu apt ffmpeg has it; on macOS `brew install ffmpeg` then check again, or use a static build from https://johnvansickle.com/ffmpeg or https://evermeet.cx/ffmpeg)')
  }
  if (tool('ffprobe')) ok('ffprobe found')
  else fail('ffprobe not found', 'It ships with ffmpeg — reinstall ffmpeg')

  console.log('\nStorage')
  try {
    mkdirSync(dataDir(), { recursive: true })
    accessSync(dataDir(), constants.W_OK)
    ok(`Data folder ${dataDir()} is writable`)
    const { bavail, bsize } = statfsSync(dataDir())
    const freeGb = (bavail * bsize) / 1e9
    if (freeGb < 2) fail(`Only ${freeGb.toFixed(1)} GB free`, 'Free up space — each processed episode is ~20–60 MB')
    else if (freeGb < 10) warn(`${freeGb.toFixed(1)} GB free — fine for a few shows; lower RETENTION_PER_SHOW if it gets tight`)
    else ok(`${freeGb.toFixed(0)} GB free`)
  } catch (err) {
    fail(`Data folder ${dataDir()} is not writable (${(err as Error).message})`, 'Set DATA_DIR in .env to a folder this user can write to')
  }
  try {
    const { db } = await import('@/lib/db')
    db()
    ok(`Database ready (${dataDir()}/podcast.db)`)
  } catch (err) {
    fail(`Database failed to open: ${(err as Error).message}`, 'Run `pnpm install` again; check the data folder permissions')
  }

  console.log('\nSettings (.env)')
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) fail('APP_URL is not set', 'Set APP_URL in .env to the public https:// address of this install')
  else if (!appUrl.startsWith('https://')) warn(`APP_URL is ${appUrl} — Apple Podcasts needs https:// to subscribe`)
  else ok(`APP_URL ${appUrl}`)

  const pw = process.env.ADMIN_PASSWORD ?? ''
  if (pw.length >= MIN_PASSWORD_LENGTH) ok('ADMIN_PASSWORD set')
  else if (pw) fail(`ADMIN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters`, 'Use a long random one: `openssl rand -base64 24`')
  else if (!oidcEnabled()) fail('No way to sign in', `Set ADMIN_PASSWORD (${MIN_PASSWORD_LENGTH}+ characters) in .env`)

  if (oidcEnabled()) {
    if (allowedEmails().length) ok(`OIDC sign-in enabled for ${allowedEmails().join(', ')}`)
    else fail('OIDC is configured but ALLOWED_EMAIL is empty', 'Set ALLOWED_EMAIL to your email, or anyone with an account at your identity provider could sign in')
  } else if (process.env.OIDC_ISSUER || process.env.OIDC_CLIENT_ID) {
    warn('OIDC is partly configured (needs OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET) — SSO button hidden')
  }

  console.log('\nNetwork')
  try {
    const r = await fetch('https://itunes.apple.com/lookup?id=1773188988', { signal: AbortSignal.timeout(10_000) })
    if (r.ok) ok('Can reach Apple Podcasts lookup')
    else warn(`Apple lookup answered HTTP ${r.status}`)
  } catch {
    fail('Cannot reach itunes.apple.com', 'This machine needs outbound internet access to download episodes')
  }
  if (appUrl?.startsWith('http')) {
    try {
      const r = await fetch(`${appUrl.replace(/\/$/, '')}/login`, { signal: AbortSignal.timeout(10_000), redirect: 'manual' })
      if (r.status === 200) ok(`${appUrl} is up and reachable`)
      else warn(`${appUrl}/login answered HTTP ${r.status} — is the app running (pnpm start)?`)
    } catch (err) {
      warn(`Could not reach ${appUrl} (${(err as Error).message}) — fine if the app isn't started yet; otherwise check DNS/HTTPS/tunnel`)
    }
  }

  console.log(failed ? '\n✖ Some required checks failed — fix the items marked ✖ above.\n' : '\n✔ All required checks passed.\n')
  process.exit(failed ? 1 : 0)
}

void main()
