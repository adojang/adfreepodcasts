# Ardwell Podcast

**Your podcasts, minus the ads.** A small self-hosted app that follows the
shows you listen to, cuts the inserted ads out of each new episode, and gives
you a private feed to subscribe to in Apple Podcasts (or any podcast app).

- Paste an Apple Podcasts link → done. New episodes are picked up within 15 minutes.
- No AI or cloud services involved in finding ads, and nothing to pay for: detection runs on your machine.
- Original episode titles, artwork and show notes. The show appears as **"AF &lt;name&gt;"**.
- Runs on a cheap VPS, a home server, a Raspberry Pi 4/5 or a Mac that stays on.

## Install it with your AI assistant

Open an AI coding assistant that can run commands on the machine you want to
use (Claude Code, Codex, Cursor, …) and paste this:

> Install Ardwell Podcast for me by following https://github.com/adojang/adfreepodcasts/blob/main/INSTALL.md

It will ask you a few questions (where to run it, whether you have a domain),
install what's needed, set up HTTPS, and hand you the address and password.

A chat-only assistant (ChatGPT or Claude in a browser) can't run commands on
your server. It can still walk you through `INSTALL.md` step by step, but
you'll be the one typing.

**Prefer doing it yourself?** You need Node 20+, pnpm and ffmpeg (with
Chromaprint; Debian/Ubuntu `apt install ffmpeg` has it). Then:

```bash
git clone https://github.com/adojang/adfreepodcasts.git && cd adfreepodcasts
pnpm install && cp .env.example .env   # set APP_URL and ADMIN_PASSWORD
pnpm build && pnpm check && pnpm start # http://localhost:3000
```

…then put it behind HTTPS. `INSTALL.md` has the details (systemd/launchd,
Caddy, Tailscale Funnel, Cloudflare Tunnel).

## Before you install: what this is for

Ardwell Podcast automates the **skip 30 seconds** button. It does nothing
you couldn't do with your thumb; it just does it for you, reliably, before
you press play.

It's meant for **you, your friends and your family**. It is *not* meant
for building a service where people pay you to listen to other people's
work without ads. The licence says so too (see below).

Podcasts are made by people, and ads are how many of them get paid. If a
show matters to you, **support it directly**: its Patreon or membership,
its paid ad-free tier if it has one, merch, or telling a friend about it.
Cutting the ads out of your own listening and giving back in a way you
choose can go together.

Please:

- **Keep your feeds private.** Your feed link has a secret token in it. Don't
  post it, share it publicly or submit it to podcast directories.
- **Don't charge anyone** for access to your feeds.
- **Don't host this as a public service.**

This project isn't affiliated with Apple, Megaphone, Spotify or any podcast
host. Shows and their content belong to their creators.

## How it finds the ads

It doesn't guess from the words. It uses how ads get into podcasts:

1. **Host ad markers.** Some hosts (Megaphone) say exactly which bytes of the
   file are inserted ads. Those are cut exactly, without re-encoding.
2. **Two downloads, compared.** Hosts insert different ads per listener, so
   the app downloads each episode twice and compares audio fingerprints
   (Chromaprint). Whatever differs between the two copies is an ad.
3. **Repeats across episodes.** Audio that shows up in several different
   episodes (network promos, recurring sponsor spots) is an ad, because the
   show itself doesn't repeat.
4. **What you teach it.** Missed one? Mark it on the episode page and it's cut
   from that episode and every future one. Cut something that wasn't an ad?
   Press "Not an ad".

It's careful by design. Anything it isn't sure about is left in, and if a
result looks wrong (duration doesn't add up, too much cut) the episode is
held back for you to review instead of being published.

**Limits:** ads the host reads themselves as part of the show aren't inserted
separately, so only step 4 catches them. Shows that are only on Apple
Podcasts (subscriber-only or Apple-exclusive) have no public feed and can't
be followed.

## Settings

Only two are required. Everything is in `.env` (see `.env.example`).

| Setting | Default | |
|---|---|---|
| `APP_URL` | — | Public `https://` address of your install |
| `ADMIN_PASSWORD` | — | Web panel password, 16+ characters |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` | Database, audio and generated secrets. Back this up. |
| `FEED_TITLE_PREFIX` | `AF ` | Put in front of each show's name |
| `RETENTION_PER_SHOW` | `15` | Processed episodes kept per show |
| `BACKFILL_COUNT` | `3` | Recent episodes processed when you add a show |
| `POLL_INTERVAL_MINUTES` | `15` | How often feeds are checked |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `ALLOWED_EMAIL`, `OIDC_NAME` | off | Optional "Sign in with …" using your own identity provider (Pocket ID, Authentik, Keycloak, …) |

## For developers

Next.js 16, SQLite (Drizzle), ffmpeg, all in one process. Architecture and
conventions are in [`AGENTS.md`](AGENTS.md). `pnpm dev`, `pnpm test`,
`pnpm typecheck`, `pnpm check`.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE). Free for personal use, friends and
family, hobby projects, education and non-profits. **Not** for commercial
use, including charging for access or running it as a paid service. If you
want to do something commercial with it, ask first.
