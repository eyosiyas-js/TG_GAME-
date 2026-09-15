# HABT Stack Deployment Notes

Date: September 2026
Server: VPS at `/var/www/habt/` (Ubuntu, Nginx, PM2, Cloudflare-proxied DNS)

## Overview

Three Node.js services, migrated from a 4-domain setup on `utopiadigitalsolutions.com`
to a leaner 2-domain setup on `oguniversity.com.et`, using path-based API routing
(same-origin `/api/...`) instead of separate API subdomains.

| Component | Path | Type | Port | Domain |
|---|---|---|---|---|
| Game frontend | `/var/www/habt/TG_GAME-/frontend` | Vite/React static build | — | `habt.oguniversity.com.et` |
| Game backend | `/var/www/habt/TG_GAME-/backend` | NestJS | 4001 | proxied at `habt.oguniversity.com.et/api/` |
| Admin frontend | `/var/www/habt/platform-command-center` | Vite/React static build | — | `admin.oguniversity.com.et` |
| Admin backend | `/var/www/habt/platform-command-center/backend` | Plain Express | 4002 | proxied at `admin.oguniversity.com.et/api/` |
| Telegram bot | `/var/www/habt/telegram-bot` | Telegraf (long polling) | — | no domain — outbound only |

Legacy/unclear status: `telegram-bot/api.js` (Express + MongoDB, port 3000) — appears to
predate the NestJS game backend; not wired into `ecosystem.config.js`; needs a frontend
code check to confirm if it's still called anywhere before deciding whether to manage it
under PM2 or retire it.

## Why path-based routing instead of separate API subdomains

- One less DNS record and SSL cert per service.
- Frontend and its API share an origin → no CORS configuration needed at all.
- The Telegram bot talks to the game backend over `http://localhost:4001` directly
  (same VPS) — never touches the public domain, which is faster and more secure.

**Important asymmetry between the two backends** (this caused real debugging time,
worth remembering):
- **Game backend (NestJS)** expects routes *without* an `/api` prefix (e.g. `/auth/login`).
  Its Nginx `proxy_pass` therefore has a **trailing slash** (`http://localhost:4001/`),
  which strips `/api/` before forwarding.
- **Admin backend (plain Express)** already has `/api` baked into its own route
  definitions (e.g. `/api/auth/login`). Its `proxy_pass` therefore has **no trailing
  slash** (`http://localhost:4002`), so `/api/...` passes through unchanged.

Getting this backwards produces a `404 Cannot POST /auth/login` (proxy stripped
`/api` but the app needed it) or a `405 Method Not Allowed` (request fell through to
the static file handler because no matching `location` block existed at all).

## DNS (Cloudflare)

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `habt` | VPS IP | Proxied |
| A | `admin` | VPS IP | Proxied |

Cloudflare SSL/TLS mode: Full (or Full Strict) — required since origin certs are
real Let's Encrypt certs, not Cloudflare-issued.

## SSL

```bash
sudo certbot certonly --nginx -d habt.oguniversity.com.et
sudo certbot certonly --nginx -d admin.oguniversity.com.et
```

## Nginx config

File: `/etc/nginx/sites-available/habt-oguniversity`, symlinked into `sites-enabled`.

```nginx
# ---- Main Game ----
server {
    listen 443 ssl;
    server_name habt.oguniversity.com.et;

    ssl_certificate /etc/letsencrypt/live/habt.oguniversity.com.et/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/habt.oguniversity.com.et/privkey.pem;

    root /var/www/habt/TG_GAME-/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:4001/;   # trailing slash: strips /api/
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ---- Admin Dashboard ----
server {
    listen 443 ssl;
    server_name admin.oguniversity.com.et;

    ssl_certificate /etc/letsencrypt/live/admin.oguniversity.com.et/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.oguniversity.com.et/privkey.pem;

    root /var/www/habt/platform-command-center/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:4002;    # no trailing slash: /api/ passed through
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location /game-api/ {
        proxy_pass http://localhost:4001/;   # admin UI's direct calls to game backend
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ---- HTTP -> HTTPS ----
server {
    listen 80;
    server_name habt.oguniversity.com.et admin.oguniversity.com.et;
    return 301 https://$host$request_uri;
}
```

Apply changes: `sudo nginx -t && sudo systemctl reload nginx`

Old config (`/etc/nginx/sites-available/habtbet` on `utopiadigitalsolutions.com`) was
disabled and removed from `sites-enabled` after migration.

## Frontend environment variables (rebuild required after any change)

**Game frontend** (`TG_GAME-/frontend/.env`):
```
VITE_API_BASE_URL=/api
VITE_SOCKET_URL=/api
```

**Admin frontend** (`platform-command-center/.env`):
```
VITE_ADMIN_API_URL=/api
VITE_GAME_API_URL=/game-api/admin/api
VITE_GAME_SERVER_URL=/game-api
```

Rebuild after any `.env` change — Vite bakes these in at build time, PM2/Nginx
changes alone won't pick up new values:
```bash
npm run build
```

**Telegram bot** (`telegram-bot/.env`):
```
BOT_TOKEN=...
MINI_APP_URL=https://habt.oguniversity.com.et/auth
GAME_API_URL=http://localhost:4001
```
`bot.js` parses `.env` manually at startup (no `dotenv` package) — a plain
`pm2 restart` re-reads it since it's a fresh process start. Note: Telegram inline
buttons are frozen at send-time — a `.env` change only affects buttons on *new*
messages (e.g. sent after a fresh `/start`), not ones already delivered.

## PM2 — `/var/www/habt/ecosystem.config.js`

```js
module.exports = {
  apps: [
    {
      name: 'habt-game-api',
      cwd: '/var/www/habt/TG_GAME-/backend',
      script: 'dist/src/main.js',   // NestJS — note the nested dist/src/ path
      env: { NODE_ENV: 'production', PORT: 4001 },
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: '500M',
      out_file: '/var/www/habt/logs/game-api-out.log',
      error_file: '/var/www/habt/logs/game-api-err.log',
    },
    {
      name: 'habt-admin-api',
      cwd: '/var/www/habt/platform-command-center/backend',
      script: 'dist/index.js',      // plain Express, not NestJS
      env: { NODE_ENV: 'production', PORT: 4002 },
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: '500M',
      out_file: '/var/www/habt/logs/admin-api-out.log',
      error_file: '/var/www/habt/logs/admin-api-err.log',
    },
    {
      name: 'habt-telegram-bot',
      cwd: '/var/www/habt/telegram-bot',
      script: 'bot.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_restarts: 30,
      restart_delay: 5000,
      max_memory_restart: '300M',
      out_file: '/var/www/habt/logs/bot-out.log',
      error_file: '/var/www/habt/logs/bot-err.log',
    },
  ],
};
```

Frontends are **not** PM2 apps — Nginx serves their static `dist/` folders directly.
This is lighter and more stable than running `vite preview` under PM2.

Bring the whole stack up:
```bash
cd /var/www/habt
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the sudo command it prints, once, to survive reboots
pm2 install pm2-logrotate
```

## Redeploying from GitHub

`/var/www/habt/deploy.sh`:
```bash
#!/bin/bash
set -e

echo "== Game backend =="
cd /var/www/habt/TG_GAME-/backend
git pull && npm ci && npm run build
pm2 reload habt-game-api

echo "== Game frontend =="
cd /var/www/habt/TG_GAME-/frontend
git pull && npm ci && npm run build

echo "== Admin backend =="
cd /var/www/habt/platform-command-center/backend
git pull && npm ci && npm run build
pm2 reload habt-admin-api

echo "== Admin frontend =="
cd /var/www/habt/platform-command-center
git pull && npm ci && npm run build

echo "== Telegram bot =="
cd /var/www/habt/telegram-bot
git pull && npm ci
pm2 reload habt-telegram-bot

echo "Done."
```

## Issues hit during this deployment (and root causes)

1. **`ecosystem.config.js` not found`** — was run from a directory without the file
   present; fixed by using the full path and confirming with `ls` first.
2. **502 Bad Gateway on both backends** — `dist/main.js` didn't exist because the
   TypeScript build had never been run in production; `npm run build` in each
   backend directory fixed it. General lesson: always confirm the built entry file
   exists (`ls dist/...`) before assuming PM2 config is wrong.
3. **Wrong entry point after building** — NestJS output landed at `dist/src/main.js`,
   not `dist/main.js`; found via `find dist -name main.js`, corrected in
   `ecosystem.config.js`.
4. **CORS error in browser** — root cause was not a CORS/backend config problem at
   all; the frontend's built `dist/` was simply stale, still calling the old
   `utopiadigitalsolutions.com` domain from before the `.env` change. Rebuilding
   after every `.env` edit resolved it.
5. **405 Method Not Allowed on admin login** — the admin server's Nginx block was
   missing an `/api/` location entirely, so POST requests fell through to the
   static-file `location /` block, which doesn't accept POST.
6. **502 again after adding the `/api/` block** — right block, but pointed at a port
   with nothing listening (`habt-admin-api` had never successfully started, same
   class of bug as #2/#3, this time for the admin backend).
7. **404 Cannot POST /auth/login on admin, even with the process running** — the
   admin backend (plain Express, not NestJS) already expects `/api/auth/login`
   internally; the Nginx `proxy_pass` was stripping `/api/` (trailing-slash
   behavior, correct for the *other* backend but wrong for this one). Removing the
   trailing slash fixed it.
8. **Pre-existing, unrelated instability**: `oguniversity-web` (a separate project
   sharing this VPS) is intermittently crash-looping with multiple duplicate PM2
   instances — noted but not addressed as part of this deployment; worth cleaning
   up separately.

## Known open item (as of this note)

Bot auto-play (bots fill empty games when no real users are present) isn't
connecting bots with real users in production. `BotPoolManager`'s heartbeat and
queue-scan logic are confirmed running (visible in `pm2 logs habt-game-api`), but
the queue it scans always reports 0 keys. Being triaged as an application-code
issue (queue read/write mismatch or a join-request that never reaches the queue
store) rather than a deployment/routing issue, pending the checklist above.
