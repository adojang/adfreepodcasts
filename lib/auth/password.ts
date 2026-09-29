import { createHash, timingSafeEqual } from 'node:crypto'
import { adminPassword, MIN_PASSWORD_LENGTH } from '@/lib/env'

const sha = (s: string) => createHash('sha256').update(s).digest()

export const passwordConfigured = () => adminPassword().length >= MIN_PASSWORD_LENGTH

/** Constant-time compare (hashing first equalises lengths). */
export function checkPassword(candidate: string): boolean {
  if (!passwordConfigured()) return false
  return timingSafeEqual(sha(candidate), sha(adminPassword()))
}

// In-memory brute-force brake: MAX_FAILURES per client per WINDOW, plus a
// global cap so rotating IPs doesn't help much. Resets on restart, which is
// fine for a single-user app with a long password.
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 10
const MAX_GLOBAL_FAILURES = 50
const failures = new Map<string, number[]>()

function recent(key: string): number[] {
  const now = Date.now()
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  failures.set(key, list)
  return list
}

export function isLockedOut(client: string): boolean {
  return recent(client).length >= MAX_FAILURES || recent('*').length >= MAX_GLOBAL_FAILURES
}

export function recordFailure(client: string): void {
  recent(client).push(Date.now())
  recent('*').push(Date.now())
}
