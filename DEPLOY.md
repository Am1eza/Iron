# Deploying آهن‌تایم (ahantime.com)

This deploys the Next.js app with **Docker Compose**: the app runs as a small
standalone container, and **Caddy** sits in front as a reverse proxy that
automatically obtains and renews a free HTTPS certificate. You only expose ports
80 and 443 to the internet.

> **The backend is live:** the stack now includes **PostgreSQL** — real OTP
> login, admin-entered prices with history, leads → پیش‌فاکتور → SMS, the admin
> panel, alerts and order tracking. On first boot the database is migrated and
> seeded automatically with the benchmarked catalog (`SEED_ON_START=true`).
> `SMSIR_API_KEY`/`SMSIR_TEMPLATE_ID` are **required** — OTP login has no
> fallback in live mode (`AUTH_ENFORCED=true` by default), so the app refuses
> to boot without them. Everything else degrades gracefully: without
> `TGJU_BASE_URL` the ticker serves seeded/last-known values, and the AI advisor
> stays off until `AI_ENABLED=true` + DeepSeek relay keys.

---

## 0. Prerequisites
- A VPS with SSH access (Ubuntu 22.04+ recommended, ≥1 GB RAM).
- Your domain **ahantime.com** with DNS you can edit.
- For an Iranian audience, prefer an Iran-based host (latency + access). Foreign
  hosts work too but may be slower/blocked for your users.

## 1. Point the domain at the server
In your DNS provider, create:

| Type  | Name | Value             |
|-------|------|-------------------|
| A     | `@`  | `<your-server-IP>`|
| CNAME | `www`| `ahantime.com`    |

Wait for it to resolve (`dig +short ahantime.com` should return your IP). TLS
issuance in step 5 will fail until DNS points here.

## 2. Install Docker on the server
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then log out/in so `docker` works without sudo
```

## 3. Get the code onto the server
```bash
git clone <your-repo-url> ahantime && cd ahantime
git checkout main
```

## 4. Configure secrets
```bash
cp .env.example .env
# generate the two required secrets:
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
```
`.env` must contain a non-empty `SESSION_SECRET`, `POSTGRES_PASSWORD`,
`SMSIR_API_KEY` **and** `SMSIR_TEMPLATE_ID` — the stack will not start
without them (OTP login has no fallback with the default `AUTH_ENFORCED=true`,
so the app fails fast rather than silently never texting a code to anyone).
`SMSIR_TEMPLATE_ID` is the numeric ID of a Verify template on your SMS.ir
panel with a `Code` variable. The other defaults (`NEXT_PUBLIC_API_MODE=live`,
`SEED_ON_START=true`) are already correct for a real launch. Set
`DEV_ADMIN_MOBILE=09…` to your own number so the seeded admin account is
yours — sign in at `/login` with that number, then manage roles at
`/admin/users`.

Optional integration keys (add anytime; the app degrades gracefully without
them): `SMSIR_LINE_NUMBER` (پیش‌فاکتور/alert texts — actually sends instead
of just logging), `TGJU_BASE_URL` (ticker), `AI_ENABLED=true` +
`DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL` (AI advisor).

## 5. Build and start
```bash
docker compose up -d --build
```
First run builds the image (a few minutes) and Caddy fetches the TLS cert for
ahantime.com + www. Then open **https://ahantime.com** 🎉

Useful commands:
```bash
docker compose logs -f web     # app logs
docker compose logs -f caddy   # TLS / proxy logs
docker compose ps              # status
docker compose down            # stop
```

## 6. Open the firewall
Allow inbound **80** and **443** (and keep **22** for SSH). Example with ufw:
```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## Updating after new commits
```bash
git pull
docker compose up -d --build
```

---

## Notes & troubleshooting
- **HTTPS won't issue:** ensure DNS points to this server and ports 80/443 are
  open and not used by another web server (`sudo lsof -i :80`). Caddy needs port
  80 reachable from the internet to validate the certificate.
- **Change the domain:** edit the hostnames in `Caddyfile` and
  `NEXT_PUBLIC_SITE_URL` in `.env`, then rebuild (`docker compose up -d --build`)
  — `NEXT_PUBLIC_*` is baked in at build time.
- **No-Docker alternative:** `pnpm install && pnpm build && node .next/standalone/server.js`
  behind nginx + certbot, kept alive by systemd/pm2. Background jobs (market
  poll, alerts, staleness, etc.) run as their own process, not inside the web
  server — also start `node scripts/migrate.mjs` once, then keep
  `tsx scripts/jobs.ts` (or the esbuild-bundled equivalent — see `Dockerfile`)
  running under systemd/pm2 alongside `server.js`, or jobs silently never run.
  Docker is recommended precisely so you don't have to wire this up by hand.
- **Resources:** the image is small (Next standalone, no native deps). 1 GB RAM
  is enough for mock mode; size up now that the live backend + DB are the default.
- **Running mock mode instead:** set `NEXT_PUBLIC_API_MODE=mock` in `.env` and
  rebuild — the frontend serves sample data with no DB/SMS/AI vars needed at all.


---

## Database operations

Migrations run automatically on every container start (`docker-entrypoint.sh`).
Useful commands on the server:

```bash
docker compose exec db pg_dump -U ahantime ahantime > backup-$(date +%F).sql   # backup
docker compose exec web node scripts/seed.mjs                                  # re-seed (idempotent)
docker compose logs -f web | grep -E "sms:dev|jobs"                            # dev SMS + job logs
```

Nightly backups: add a cron entry —
`0 3 * * * cd /path/to/ahantime && docker compose exec -T db pg_dump -U ahantime ahantime | gzip > /var/backups/ahantime-$(date +\%F).sql.gz`

## Local development against a real database

```bash
docker compose up -d db          # just Postgres
cd web
export DATABASE_URL=postgres://ahantime:<POSTGRES_PASSWORD>@localhost:5432/ahantime
pnpm db:migrate && pnpm db:seed
NEXT_PUBLIC_API_MODE=live SESSION_SECRET=dev-secret pnpm dev
```
(Note: the bundled `db` service doesn't publish 5432 to the host by default —
add `ports: ["5432:5432"]` to it locally, or run any local Postgres.)
