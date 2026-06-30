# Deploying آهن‌تایم (ahantime.com)

This deploys the Next.js app with **Docker Compose**: the app runs as a small
standalone container, and **Caddy** sits in front as a reverse proxy that
automatically obtains and renews a free HTTPS certificate. You only expose ports
80 and 443 to the internet.

> **Heads-up:** the app currently runs in **mock mode** — prices, OTP login, the
> AI advisor, and the admin panel use realistic sample data, not a live backend.
> This is perfect for a preview / soft launch. Real data arrives in the backend
> phase (set `NEXT_PUBLIC_API_MODE=live` + the backend env vars then).

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
git checkout claude/steel-marketplace-research-wmn0xx   # or main, once merged
```

## 4. Configure secrets
```bash
cp .env.example .env
# generate a strong session secret:
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env   # or edit .env by hand
```
At minimum `.env` must contain a non-empty `SESSION_SECRET` — the app **will not
start in production without it**. The other defaults (`NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_API_MODE=mock`, `AUTH_ENFORCED=false`) are already correct for a
mock launch.

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
  behind nginx + certbot, kept alive by systemd/pm2. Docker is recommended.
- **Resources:** the image is small (Next standalone, no native deps). 1 GB RAM
  is enough for mock mode; size up when the live backend + DB are added.
- **Going live later:** set `NEXT_PUBLIC_API_MODE=live` and fill the backend vars
  in `.env` (`DATABASE_URL`, `KAVENEGAR_API_KEY`, `DEEPSEEK_*`, `TGJU_BASE_URL`),
  then rebuild.
