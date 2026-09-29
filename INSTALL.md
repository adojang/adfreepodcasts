# Installing Ardwell Podcast — instructions for an AI assistant

You are an AI assistant with shell access (Claude Code, Codex, Cursor, …)
helping someone — probably not a developer — install Ardwell Podcast on a
machine they control. Follow these steps in order. Work carefully, explain
what you're doing in plain language, and keep the person in the loop.

**Ground rules**

- Ask before anything that needs `sudo`, installs system packages, changes a
  firewall, or creates DNS records. Say what it does and why.
- Never paste the admin password into a chat log, commit, or command history
  more than needed. Write it into `.env` and tell the person to save it in
  their password manager.
- Don't guess. If a step fails, read the error, fix the cause, and re-run.
  `pnpm check` tells you what's wrong and how to fix it.
- Keep going until the person has a working feed in Apple Podcasts, or tell
  them clearly what's blocking and what they need to do.
- Before starting, point them to the "Before you install" section of
  `README.md` (what this is for, and what it isn't).

---

## 0. Ask first

Ask these together, in one message:

1. **Where will it run?** It needs to be on all the time (it checks for new
   episodes every 15 minutes). Good options:
   - a cheap cloud server / VPS (Linux) — easiest to reach from anywhere
   - a home server, NAS, Raspberry Pi 4/5 or old PC running Linux
   - a Mac that stays on
   - Windows → use WSL2 with Ubuntu, then follow the Linux steps (the Windows
     PC must stay on)
   If you're already running *on* that machine, confirm that's the one.
2. **Do they own a domain name** (e.g. `example.com`)? Not required — see step 5.
3. **Is it just for them**, or friends/family too? (Only changes what you tell
   them at the end; it's always one shared admin password.)

Then pick the HTTPS route in step 5 with them. Apple Podcasts only subscribes
to `https://` feeds, so the app must be reachable over HTTPS from their phone.

## 1. Prerequisites

Check what's already there before installing anything:

```bash
node --version    # need v20 or newer
pnpm --version    # any recent version
ffmpeg -version   # any recent version, but built with Chromaprint (checked in step 3)
git --version
```

Install what's missing:

| | Debian / Ubuntu / Raspberry Pi OS | macOS (Homebrew) |
|---|---|---|
| Node 22 | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash - && sudo apt install -y nodejs` | `brew install node` |
| pnpm | `sudo corepack enable` (or `npm install -g pnpm`) | `corepack enable` |
| ffmpeg | `sudo apt install -y ffmpeg` | `brew install ffmpeg` |
| git | `sudo apt install -y git` | `xcode-select --install` |

No Homebrew on a Mac? Install it from https://brew.sh first (ask).

## 2. Get the code and configure it

```bash
cd ~
git clone https://github.com/adojang/adfreepodcasts.git
cd adfreepodcasts
pnpm install
cp .env.example .env
chmod 600 .env
```

Generate a password and put it in `.env` together with the address. If you
don't know the final HTTPS address yet (step 5), use `http://localhost:3000`
for now and come back to it:

```bash
openssl rand -base64 24    # use this as ADMIN_PASSWORD
```

`.env` needs exactly two lines filled in:

```
APP_URL=https://podcasts.example.com
ADMIN_PASSWORD=<the generated password>
```

Everything else in `.env.example` is optional — leave it commented out
unless the person asks for something (e.g. keep more episodes, sign in with
their own identity provider).

## 3. Build and check

```bash
pnpm build
pnpm check
```

`pnpm check` must end with **"All required checks passed"**. Fix anything
marked ✖ (it prints how). A warning about `APP_URL` not being https or not
reachable is expected until step 5 is done.

Common fix: *"ffmpeg was built without Chromaprint"* — on Debian/Ubuntu the
normal `apt` ffmpeg has it; on other systems use a static build from
https://johnvansickle.com/ffmpeg (Linux) or https://evermeet.cx/ffmpeg (Mac)
and make sure it comes first on `PATH`.

## 4. Keep it running (starts on boot, restarts on crash)

The app is one process: `pnpm start` serves the web panel and feeds on port
3000 and runs the background worker. Set `PORT` to use another port.

**Linux (systemd).** Create `/etc/systemd/system/ardwell-podcast.service`
(ask first — needs sudo). Replace USER and paths (`which pnpm` for the pnpm path):

```ini
[Unit]
Description=Ardwell Podcast
After=network-online.target
Wants=network-online.target

[Service]
User=USER
WorkingDirectory=/home/USER/adfreepodcasts
ExecStart=/usr/bin/pnpm start
Environment=PORT=3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ardwell-podcast
systemctl status ardwell-podcast --no-pager
journalctl -u ardwell-podcast -n 50 --no-pager   # logs
```

**macOS (launchd).** Create `~/Library/LaunchAgents/com.ardwell.podcast.plist`
(replace USER; `which pnpm` for the path; Homebrew is `/opt/homebrew/bin` on
Apple Silicon):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ardwell.podcast</string>
  <key>WorkingDirectory</key><string>/Users/USER/adfreepodcasts</string>
  <key>ProgramArguments</key><array><string>/opt/homebrew/bin/pnpm</string><string>start</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>PORT</key><string>3000</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/USER/adfreepodcasts/data/app.log</string>
  <key>StandardErrorPath</key><string>/Users/USER/adfreepodcasts/data/app.log</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.ardwell.podcast.plist
```

Also tell them to stop the Mac sleeping (System Settings → Energy → prevent
automatic sleeping).

Check it's up: `curl -sI http://localhost:3000/login` → `HTTP/1.1 200`.

## 5. HTTPS — make it reachable from their phone

Pick **one** with the person:

**A. Cloud server + their own domain → Caddy** (automatic free certificates)

1. Create a DNS **A record** for a subdomain (e.g. `podcasts.example.com`) →
   the server's public IP (`curl -4 ifconfig.me`). They do this at their
   domain registrar — walk them through it.
2. Open ports 80 and 443 (e.g. `sudo ufw allow 80,443/tcp`; cloud providers
   often also need it allowed in their web console's firewall/security list).
3. Install Caddy (https://caddyserver.com/docs/install), then set
   `/etc/caddy/Caddyfile` to:
   ```
   podcasts.example.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```
   `sudo systemctl reload caddy`.
4. `APP_URL=https://podcasts.example.com`.

**B. At home, no domain, nothing to open on the router → Tailscale Funnel**

1. Install Tailscale (https://tailscale.com/download) and log in (`sudo tailscale up`).
2. In the Tailscale admin console enable HTTPS certificates and Funnel for
   this machine (the CLI prints the link if it's not enabled).
3. `sudo tailscale funnel --bg 3000`
4. It prints `https://<machine>.<tailnet>.ts.net` — that's `APP_URL`.

**C. At home with a domain on Cloudflare → Cloudflare Tunnel**

1. Install `cloudflared`, then `cloudflared tunnel login`,
   `cloudflared tunnel create ardwell-podcast`,
   `cloudflared tunnel route dns ardwell-podcast podcasts.example.com`.
2. Config (`~/.cloudflared/config.yml`): ingress `podcasts.example.com` →
   `http://localhost:3000`, then `sudo cloudflared service install`.
3. `APP_URL=https://podcasts.example.com`.

**D. They already run a reverse proxy** (Nginx Proxy Manager, Traefik, Caddy…):
add a host for their chosen name pointing to this machine's port 3000 with
HTTPS on. Don't disable HTTP Range requests (Apple Podcasts needs them for audio).

After any of these: update `APP_URL` in `.env`, restart the service
(`sudo systemctl restart ardwell-podcast` / `launchctl kickstart -k gui/$(id -u)/com.ardwell.podcast`),
and run `pnpm check` again — it should now say the address is reachable.

## 6. First use — hand over to the person

1. Open `APP_URL` in a browser and sign in with the admin password.
2. Paste an Apple Podcasts link (Share → Copy Link in the Podcasts app, or the
   address from podcasts.apple.com) and press **Add show**. The 3 newest
   episodes are processed right away — about 15–60 seconds each.
3. On the show's page, press **Copy** (or **Open in Podcasts** on an iPhone/Mac).
4. In Apple Podcasts: **Library → ⋯ (top right) → Follow a Show by URL**
   (Mac: **File → Follow a Show by URL**), paste, done. The show appears as
   "AF <name>".

Finish with a short summary for them: the address, that the password is in
`.env` (and their password manager), how to see logs, and how to update
(below). Remind them the feed link is private — sharing it shares their
copy of the show.

## Updating

```bash
cd ~/adfreepodcasts
git pull
pnpm install
pnpm build
sudo systemctl restart ardwell-podcast    # or the launchctl kickstart line above
pnpm check
```

The database updates itself on start. `data/` (database, audio, secrets) is
never touched by updates — back that folder up if anything.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login page says no admin password | `ADMIN_PASSWORD` missing or < 16 characters in `.env`; restart |
| `Could not locate the bindings file` / better-sqlite3 errors | `pnpm rebuild better-sqlite3` (Node was upgraded) |
| Port already in use | Set `PORT=3001` in the service file and your proxy/tunnel |
| Episode stuck on *Needs review* | Detector couldn't verify the cut; open it, press Retry; if it persists the show's host may have changed how it serves ads |
| An ad slipped through | Episode page → "Missed an ad?" → mark it; it's cut there and in future episodes |
| Apple Podcasts won't add the feed | `APP_URL` must be `https://` and reachable from the phone's network (try the feed URL in the phone's browser) |
| Disk filling up | Lower `RETENTION_PER_SHOW` in `.env` (default 15 episodes per show) |
