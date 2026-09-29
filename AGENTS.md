<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Ardwell Podcast

Instructions for AI coding agents working **on this codebase**. (Installing
it for someone? Follow `INSTALL.md` instead.) `CLAUDE.md` just imports this.

Self-hosted ad-stripping podcast proxy. Paste an Apple Podcasts link → the
background worker follows the show's RSS, downloads each new episode, cuts
the ads **without any AI/LLM**, and republishes a private per-show feed titled
`<FEED_TITLE_PREFIX><Show>` (episode titles and guids unchanged) at
`<APP_URL>/f/<feed token>/<slug>.xml`.

## Stack

- Next.js 16 (App Router, `proxy.ts` not middleware), React 19, TypeScript, pnpm.
- SQLite via better-sqlite3 + Drizzle (`lib/db/`). Migrations in `drizzle/`
  are applied automatically on first DB use; after a schema change run
  `pnpm db:generate` and commit the new migration.
  better-sqlite3 transactions are **synchronous** — no `await` inside `db().transaction()`.
- One process: `instrumentation.ts` starts the worker (`lib/worker.ts`) inside
  the Next server. `WORKER=off` disables it.
- ffmpeg/ffprobe (with Chromaprint) do all audio work — no re-encoding.
- UI: Tailwind 4 + shadcn (`components/ui/`, base-nova style). Colours only
  via the theme tokens in `app/globals.css` — no hardcoded colours, no gradients.
  Fonts: Geist (text) + Geist Mono (times/numbers).
- Auth: `ADMIN_PASSWORD` (`lib/auth/password.ts`, rate-limited) and/or optional
  OIDC (`OIDC_*`, PKCE, `openid-client`), `iron-session` cookie. `proxy.ts`
  guards everything except `/login`, `/api/auth/*`, `/f/*` (feed/audio check
  the feed token themselves).
- Config: `lib/env.ts`. Only `APP_URL` and `ADMIN_PASSWORD` are required;
  session secret and feed token are generated into `DATA_DIR/secrets.json`.

## Checks

`pnpm test && pnpm typecheck && pnpm lint` must pass (CI runs them).
`pnpm check` verifies an install (ffmpeg/Chromaprint, settings, disk, network).

## How ad removal works

`lib/pipeline.ts` → download (headers from the **same** GET as the body —
DAI ad loads differ per request) → detect → render → verify → publish.

1. **Megaphone** (`lib/detect/megaphone.ts`): `x-megaphone-payload-2` lists every
   inserted ad's exact byte range; kept ranges are concatenated (no re-encode).
   Every boundary must land on an MP3 frame sync. A Megaphone file **without**
   the header → `needs_review` (never publish with ads).
2. **Fingerprints** (`lib/detect/fingerprint.ts`, ffmpeg's built-in chromaprint,
   brute-force diagonal Hamming scan) on what's left (`lib/detect/generic.ts`):
   - `diff` (non-Megaphone only): audio in our download but not in a second
     download with another UA (`curl/8.5.0`) — different DAI fill.
   - `repeat` (non-Megaphone only): 10 s–5 min stretches shared with the show's
     last 3 episodes (promos). Under 15 s = 0.6 confidence → suggestion only.
   - `library`/`manual`: `ad_library` entries (auto-learned from diff/repeat
     cuts, or marked in the UI) are projected at full length where they match.
     `keep` entries ("Not an ad") veto overlapping candidates.
   - Only confidence ≥ 0.9 is cut (`cutByTime`, stream copy).
3. Verify: output duration = original − ads (±3 s), ads ≤ 60 % of the file,
   else `needs_review`. Transient errors retry with backoff (5×) then `failed`.

Validated: Megaphone cut points transcribe clean; blind diff+repeat on a
Megaphone download found all 8 ads the header reported (edges ±0.8 s); a
Simplecast show's pre/mid/post rolls were found by diff alone.

Episode statuses: `skipped` (older than the 3-episode backfill; process on
demand) · `pending` · `processing` · `done` · `needs_review` · `failed` · `expired`.
