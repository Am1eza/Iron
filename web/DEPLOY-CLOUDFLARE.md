# Deploying ahantime.com to Cloudflare (Workers + OpenNext)

The Poladin web app is deployed to **Cloudflare Workers** using the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare), which runs the
full Next.js app — SSR, `/api/*` routes, OTP auth, and the `/account` area — on
the Workers runtime. (The GitHub Pages workflow still produces the static mock
preview; this is the real production path.)

## What's already wired in the repo

| File | Purpose |
| --- | --- |
| `web/wrangler.jsonc` | Worker config + `ahantime.com` / `www.ahantime.com` custom-domain routes |
| `web/open-next.config.ts` | OpenNext adapter config |
| `web/next.config.mjs` | `initOpenNextCloudflareForDev()` for local binding support |
| `web/package.json` | `cf:build` / `cf:preview` / `cf:deploy` / `cf-typegen` scripts + `@opennextjs/cloudflare`, `wrangler` |
| `.github/workflows/deploy-cloudflare.yml` | CI: builds + deploys on push to `main` (paths `web/**`) |
| `web/.dev.vars.example` | Template for runtime secrets |

## One-time setup (requires your Cloudflare account — cannot be automated here)

1. **Add `ahantime.com` as a zone** in your Cloudflare account and point the
   registrar's nameservers at Cloudflare (Cloudflare dashboard → Add a site).
   The `custom_domain` routes in `wrangler.jsonc` auto-create the DNS records and
   TLS cert on first deploy, but the zone must exist and be active first.

2. **Create a Cloudflare API token** (My Profile → API Tokens) with:
   - *Account* → Workers Scripts: Edit
   - *Zone* → Workers Routes: Edit, DNS: Edit (scoped to the `ahantime.com` zone)
   Note your **Account ID** (dashboard sidebar).

3. **Add GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   Optionally set the variable `NEXT_PUBLIC_API_MODE` to `live` once a backend exists.

4. **Set the app's runtime secrets** on the Worker (see `web/.dev.vars.example`
   for the list) — either:
   ```bash
   cd web
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put SMSIR_API_KEY
   npx wrangler secret put SMSIR_TEMPLATE_ID    # …and the rest
   ```
   or via Workers → `ahantime` → Settings → Variables and Secrets.

## Deploying

- **Automatic:** push to `main` (any change under `web/**`) → the workflow runs
  `pnpm run cf:deploy`.
- **Manually from your machine:**
  ```bash
  cd web
  npx wrangler login          # one-time browser auth
  pnpm install
  pnpm run cf:deploy
  ```
- **Preview in the Workers runtime locally** (more accurate than `next dev`):
  ```bash
  cd web && pnpm run cf:preview
  ```

## Notes

- Pin `@opennextjs/cloudflare` to **≥ 1.3.0** (the `^1.3.0` here satisfies it) —
  earlier versions had the CVE-2025-6087 `/_next/image` SSRF.
- `nodejs_compat` + a compatibility date ≥ `2024-09-23` are required and set in
  `wrangler.jsonc`.
- ISR / incremental cache currently uses the in-Worker default; back it with R2 or
  KV via `open-next.config.ts` if you need persistent caching across instances.
