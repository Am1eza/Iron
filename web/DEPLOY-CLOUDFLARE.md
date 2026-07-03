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
   for the full list) — at minimum, live mode structurally requires
   `DATABASE_URL` and `SESSION_SECRET` (the app 503s `db_unavailable` on every
   DB-backed route, including the AI advisor, without the former; auth cannot
   sign a session JWT without the latter):
   ```bash
   cd web
   npx wrangler secret put DATABASE_URL     # see "which connection string" below
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put SMSIR_API_KEY
   npx wrangler secret put SMSIR_TEMPLATE_ID    # …and the rest
   ```
   or via Workers → `ahantime` → Settings → Variables and Secrets.
   `NEXT_PUBLIC_API_MODE` must also be `live` (set as a GitHub Actions
   variable, step 3 above, or a plain Worker var) — otherwise the app boots
   in mock mode and never touches the database at all.

   **Which connection string** — if your Postgres provider offers a pooled
   endpoint (e.g. Neon's PgBouncer-backed `...-pooler....neon.tech` host vs.
   its direct `...neon.tech` host), **use the pooled one for this Worker
   secret**. `db/client.ts` opens a fresh, small `pg.Pool` per request on
   Workers (see Notes below) — under real concurrent traffic that adds up to
   many simultaneous *direct* backend connections, which a pooled endpoint
   is specifically designed to absorb without exhausting the database's
   connection limit. This is safe here because the Worker never runs the
   background job scheduler (it always runs as its own separate Node.js
   process, see `scripts/jobs.ts`), so none of the Worker's queries ever need
   session-scoped state.
   **Exception — do NOT use a pooled endpoint for the Docker/self-hosted
   deployment path** (`docker-compose.yml`'s `DATABASE_URL`, if you point it
   at the same external Postgres instead of the bundled `db` service): the
   job scheduler in that process takes a **session-scoped** advisory lock
   (`pg_try_advisory_lock`/`pg_advisory_unlock` on one dedicated connection,
   see `jobs/scheduler.ts`) to keep jobs from double-running across
   replicas. PgBouncer's transaction-mode pooling (what Neon's pooled
   endpoint uses) can hand that connection's next query to a *different*
   backend session, silently breaking the lock's mutual exclusion — the
   `unlock` call would then be a no-op on a lock nobody actually holds. Use
   the direct (non-pooled) connection string there.

5. **(Recommended for production) Provision Cloudflare Hyperdrive** — raw TCP
   Postgres from a Worker has no cross-request connection pooling of its own
   (each request opens a fresh TCP+TLS handshake), so at real traffic volumes
   it risks exhausting your database's connection limit. Hyperdrive pools and
   caches connections at Cloudflare's edge, transparently, with zero
   additional application code — `web/src/lib/server/db/client.ts` already
   detects a `HYPERDRIVE` binding and prefers it automatically the moment one
   is configured:
   ```bash
   cd web
   npx wrangler hyperdrive create ahantime-db \
     --connection-string="postgres://user:pass@host:5432/db"
   ```
   Copy the printed `id` into `wrangler.jsonc`:
   ```jsonc
   "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id from the command above>" }]
   ```
   Redeploy after adding the binding. `DATABASE_URL` must still be set (step 4)
   even when Hyperdrive is bound — it's the boot-time fail-fast check
   (`src/lib/validation/env.ts`) and the fallback if the binding is ever
   removed; the actual runtime traffic goes through Hyperdrive once bound.

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
- `nodejs_compat` + a compatibility date ≥ `2024-09-23` are the minimum for
  Next.js itself to run on Workers at all — but **secrets/vars set via
  `wrangler secret put` or the dashboard are only exposed on `process.env`**
  once the `nodejs_compat_populate_process_env` compatibility flag is active
  (auto-enabled only once `compatibility_date` is ≥ `2025-04-01`, or set
  explicitly otherwise, which is what `wrangler.jsonc` does here). Without it
  the Worker deploys fine and looks healthy, but every `process.env.*` read
  is `undefined` — `DATABASE_URL`, `SESSION_SECRET`, everything — which is
  exactly what produced the `db_unavailable` 503 on the AI advisor and the
  fixture-data fallback on `/api/market` before this flag was added.
- `db/client.ts` opens a **fresh Postgres pool per request on Workers**, not
  a persisted one — Cloudflare does not allow a TCP socket created in one
  request to be reused in another (`"TCP sockets cannot be created in global
  scope and shared across requests"`); a shared pool works for exactly one
  request per Worker isolate and then hangs (confirmed locally via
  `wrangler dev` against a real Postgres: every other request silently hung
  until the runtime's watchdog killed it). This is transparent to callers —
  `getDb()`'s signature is unchanged — and is exactly the class of problem
  Hyperdrive (step 5 above) is designed to solve at the edge instead.
- ISR / incremental cache currently uses the in-Worker default; back it with R2 or
  KV via `open-next.config.ts` if you need persistent caching across instances.
