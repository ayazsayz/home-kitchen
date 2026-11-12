# Install on the client's own PC (Docker / offline)

One codebase, three ways to run it — set by `APP_MODE`:

| Mode | Where | Database | Customer website | Internet |
|---|---|---|---|---|
| `online` (default) | Vercel | Supabase Cloud | on | needed |
| `docker` | client's PC / server, Docker | Supabase in Docker | on (if the PC is reachable) | optional |
| `offline` | shop laptop, Docker | Supabase in Docker | **off** — staff take WhatsApp / phone / walk-in orders | not needed |

Online installs don't use this folder (see the main README). Override the website with `FEATURE_CUSTOMER_SITE=on|off` in `deploy/.env`.
Card payments, the summary email and Google Maps switch on only when their keys are set in `deploy/.env` (they need internet).

## What the PC needs
- Windows 10/11 (or Linux / macOS), **16 GB RAM recommended** (8 GB minimum), SSD, ~10 GB free.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- Internet **once** for the install (downloads ~2–3 GB). After that `offline` mode runs without internet.
- Give the laptop a fixed IP on the shop Wi-Fi (router → DHCP reservation) so tablets/phones always find it, and uploaded photos keep working.

## Install
1. Copy this project to the PC (`git clone …`, or download the ZIP from GitHub and unzip).
2. Windows: right-click `deploy\install.ps1` → **Run with PowerShell** (or `powershell -ExecutionPolicy Bypass -File deploy\install.ps1 -Mode offline -TimeZone Asia/Karachi`).
   Linux/macOS: `sh deploy/install.sh offline Asia/Karachi`.
3. It makes `deploy/.env` (random passwords/keys), builds the app, starts everything and creates the **owner login**.
4. Open `http://localhost:3000/admin`. Other devices on the Wi-Fi: `http://<laptop IP>:3000/admin` (allow ports 3000 and 8000 in Windows Firewall if asked).
5. In Settings → Region set country / currency / phone code; add the menu; add staff on the Staff page.

Everything starts again by itself when the PC restarts (Docker Desktop → Settings → "Start when you sign in").

**Keep a copy of `deploy/.env`** (USB / password manager). It holds the database password and keys.

## Daily backups
- Every day at `BACKUP_TIME` (default 07:30), all data + photos go to `deploy/backups` (kept `BACKUP_KEEP_DAYS` = 30 days). If the laptop was off, it runs as soon as it's back on.
- Better: set `BACKUP_DIR=D:/hk-backups` (a USB / external drive) in `deploy/.env`, then `docker compose -f deploy/docker-compose.yml up -d`.
- Backup now: `docker compose -f deploy/docker-compose.yml exec scheduler sh /app/deploy/scripts/backup.sh`
- Restore (replaces all current data):
  `docker compose -f deploy/docker-compose.yml exec scheduler sh /app/deploy/scripts/restore.sh hk-2026-11-11_0730.sql.gz yes`
- New laptop: install, then copy the backup files into `deploy/backups` and restore.

## Update to a new version
Windows `deploy\update.ps1`, Linux/macOS `sh deploy/update.sh` — takes a backup, pulls the new code, rebuilds, applies new database changes automatically.

## Useful commands (from the project folder)
| | |
|---|---|
| Status | `docker compose -f deploy/docker-compose.yml ps` |
| Logs | `docker compose -f deploy/docker-compose.yml logs -f app` |
| Stop / start | `docker compose -f deploy/docker-compose.yml stop` / `up -d` |
| Another owner | `docker compose -f deploy/docker-compose.yml exec app node deploy/scripts/create-owner.mjs email "password" "Name"` |
| Database admin (Supabase Studio) | `http://localhost:8000` — user/password: `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` in `deploy/.env` |

## How it fits together
- `supabase/` — the official Supabase self-hosting files, unchanged (version in `supabase/VERSION`).
- `supabase-overrides.yml` — the database files live in a Docker volume (a Windows folder is too slow for Postgres).
- `docker-compose.yml` — includes them and adds: `migrate` (runs `supabase/schema.sql` + new migrations once, tracked in `hk_internal.migrations`), `app` (this app, `APP_MODE` from `.env`), `scheduler` (daily summary + backups).
- The app image is built on the PC; the browser reaches Supabase at port 8000 of whatever address it opened the app from, the app server uses `http://kong:8000` inside Docker.

## First-install checklist (try it on a spare PC before a client)
- [ ] `install.ps1` finishes, `docker compose … ps` shows everything running, `hk-migrate` exited 0
- [ ] owner logs in on the laptop and from a phone on the same Wi-Fi
- [ ] add a dish with a photo, take an order on New order, it prints
- [ ] turn Wi-Fi off: orders still work on the laptop
- [ ] `deploy/backups` has a backup after a minute or two; a restore into a test install works
- [ ] restart the PC: everything comes back on its own
