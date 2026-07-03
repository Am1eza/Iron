# Deploying ahantime.com to Cloudflare (Workers + OpenNext)

The Poladin web app is deployed to **Cloudflare Workers** using the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare), which runs the
full Next.js app — SSR, `/api/*` routes, OTP auth, and the `/account` area — on
the Workers runtime. (The GitHub Pages workflow still produces the static mock
preview; this is the real production path.)

**Build/deploy is handled by Cloudflare's own "Workers Builds" git
integration** (Workers & Pages → `ahantime` → Settings → Build), configured
directly in the Cloudflare dashboard — not by a GitHub Actions workflow. An
earlier `deploy-cloudflare.yml` workflow existed but was removed (it required
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` as GitHub secrets that were
never set, so it failed on every push); Workers Builds needs no GitHub-side
secrets at all — it authenticates directly through Cloudflare's own GitHub
App installation on this repo.

## What's already wired in the repo

| File | Purpose |
| --- | --- |
| `web/wrangler.jsonc` | Worker config (compat flags, assets binding, observability) |
| `web/open-next.config.ts` | OpenNext adapter config |
| `web/next.config.mjs` | `initOpenNextCloudflareForDev()` for local binding support |
| `web/package.json` | `cf:build` / `cf:preview` / `cf:deploy` / `cf-typegen` scripts + `@opennextjs/cloudflare`, `wrangler` |
| `web/.dev.vars.example` | Template for runtime secrets |

## One-time setup (requires your Cloudflare account — cannot be automated here)

1. **Connect the repo via Workers Builds**, if not already done: Cloudflare
   dashboard → Workers & Pages → Create → Import a repository, or on an
   existing `ahantime` Worker → Settings → Build → connect this GitHub repo.
   Set the build command to `pnpm run cf:build` (or leave Cloudflare's
   Next.js auto-detection) and root directory to `web`. Every push to `main`
   then builds + deploys "production"; every branch/PR gets its own preview
   URL — this is what's already posting the ✅ build-status comments on PRs.

2. **Add `ahantime.com` as a zone** in your Cloudflare account and point the
   registrar's nameservers at Cloudflare (Cloudflare dashboard → Add a site)
   — the zone must exist and be active before the next step.

3. **Attach the custom domain to the Worker**: Workers & Pages → `ahantime` →
   Settings → Domains & Routes → Add → Custom Domain → `ahantime.com` (and
   again for `www.ahantime.com`). This auto-creates the DNS record + TLS
   cert. `wrangler.jsonc` deliberately does **not** declare `custom_domain`
   routes — doing it here instead means the first deploy always lands on a
   working `*.workers.dev` URL with zero DNS dependency, and you attach the
   real domain once you've confirmed that URL works.
   **If `ahantime.com` 503s from Cloudflare's edge while
   `https://ahantime.<your-workers-dev-subdomain>.workers.dev` works fine,
   this step is the fix** — it means the Worker is healthy but the domain
   was never actually bound to it (or the binding broke). Check this page
   first before debugging application code.

4. **Set the app's build-time and runtime config** — both matter, and
   missing either one silently keeps the site behaving as if nothing here
   was ever deployed:
   - **Build-time**: in the Workers Builds project settings (not a Worker
     secret — this is a `NEXT_PUBLIC_*` var, inlined into the client bundle
     at build time), set `NEXT_PUBLIC_API_MODE=live`. Without this the app
     ships built in `mock` mode: every client-side data call (catalog,
     market ticker, the AI chat button) short-circuits to canned fixture
     data or a "coming soon" message and **never reaches your API routes at
     all**, regardless of what secrets are set below.
   - **Runtime secrets** on the Worker (see `web/.dev.vars.example` for the
     full list) — at minimum, live mode structurally requires
     `DATABASE_URL` and `SESSION_SECRET` (the app 503s `db_unavailable` on
     every DB-backed route, including the AI advisor, without the former;
     auth cannot sign a session JWT without the latter). **The AI advisor
     additionally needs its own master switch** — `AI_ENABLED` must be set
     to the exact string `true` (not `True`/`1`), or `/api/ai/chat` 503s
     `ai_disabled` regardless of how correct `DEEPSEEK_API_KEY`/
     `DEEPSEEK_BASE_URL` are — this is the single most commonly missed step
     since it's easy to assume the two DeepSeek keys alone are enough:
   ```bash
   cd web
   npx wrangler secret put DATABASE_URL     # see "which connection string" below
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put SMSIR_API_KEY
   npx wrangler secret put SMSIR_TEMPLATE_ID    # …and the rest
   npx wrangler secret put AI_ENABLED       # exactly: true
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put DEEPSEEK_BASE_URL
   ```
   or via Workers → `ahantime` → Settings → Variables and Secrets.

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

- **Automatic:** push to `main` → Cloudflare Workers Builds picks it up and
  deploys to production; any other branch/PR gets its own preview deployment
  (visible as a bot comment on the PR with a preview URL). No local action
  needed — this is the normal path.
- **Manually from your machine** (rarely needed — e.g. to deploy without
  waiting on a push, or to debug the build itself):
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
