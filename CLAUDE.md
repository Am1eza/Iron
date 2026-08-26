# CLAUDE.md — Ahantime (آهن‌تایم)

Guidance for AI agents working in this repository. Read this before touching code.

---

## 1. What this is

**ahantime.com** — a Persian-first (RTL) smart marketplace for iron & steel in Iran.
Business model is **lead-gen, not e-commerce**: the site publishes transparent live
prices, an AI advisor grounded in real data, and a guaranteed delivery-time promise;
the actual sale is closed by a human over the phone.

> **There is no online payment.** «اول مشورت، بعد خرید.»

Funnel: Magnet → Engage → Capture (پیش‌فاکتور / proforma) → Convert (human call) → Retain.

### Locked product decisions (do not "improve" these)
| Decision | Value |
|---|---|
| Payments | **None online.** Proforma + human close. |
| Prices | 100% **admin-entered**. No bourse formula. Weight = deterministic formula. |
| AI | **Parspack AI Studio** (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`), server-side via an **out-of-Iran relay**. Grounded — never invents a number. Was DeepSeek until 1405/05; the owner changed provider when that relay hit a permanent HTTP 402. Env vars are provider-neutral (`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`, legacy `DEEPSEEK_*` still accepted) — see `web/src/lib/server/integrations/aiRelayConfig.ts`. It is a REASONING model: `AI_REASONING_EFFORT` must stay capped or every tool round trip times out. |
| Ticker | FX/gold from **BrsAPI** (api.brsapi.ir), ounce from gold-api.com; billet is admin-entered. |
| Auth | Mobile number + **OTP**. |
| SMS | **SMS.ir — OWNER-LOCKED.** Never propose another provider. |
| Hosting | Hybrid — app + DB inside Iran, AI relay outside. |
| Localization | Persian-first, RTL, Jalali dates, Toman currency. |
| UI kit | **None.** No Tailwind/MUI/Bootstrap. CSS Modules + `design/tokens.css` only. |
| CDNs | **None.** Fonts and JS are self-hosted (Iran reachability). |

---

## 2. Repository layout

```
/opt/ahantime/                 ← repo root AND the live production deploy dir
├─ docs/ product/ design/ brand/ foundation/   ← Layers 1–3 specs (the source of truth for intent)
├─ ops/                        ← ahantime-db-backup.sh (restic)
├─ docker-compose.yml          ← web, db, redis, matomo(+db), caddy, glitchtip(×5)
├─ Caddyfile                   ← TLS + host routing (ahantime.com, panel.ahantime.com)
├─ .env                        ← REAL SECRETS, gitignored. Never read into output or commit.
├─ DEPLOY.md · GEO-ROUTING.md · README.md
└─ web/                        ← the Next.js app (everything below is relative to here)
   ├─ src/app/                 ← App Router · 122 route handlers under src/app/api/
   ├─ src/components/          ← ~30 domains (admin, ai, catalog, market, forms, primitives…)
   ├─ src/lib/
   │  ├─ auth/                 ← jwt, session, guards, roles, sms, store.pg, origin
   │  ├─ server/               ← db/ (drizzle schema ×11), repos/ (39), services/, jobs/, integrations/
   │  ├─ validation/ config/ api/ stores/ hooks/ utils/ i18n/
   ├─ src/middleware.ts        ← admin gating + panel-host rewrite + DB-backed redirects
   ├─ drizzle/                 ← 27 SQL migrations + meta/_journal.json
   ├─ e2e/                     ← Playwright
   └─ next.config.mjs          ← **the single source of truth for security headers**
```

**Scale:** ~620 TS/TSX files, ~70k LOC, 122 API routes, 79 test files, 27 migrations.

### Layer model (from README.md)
Layers 1–3 (Vision / Product Design / UI System) are **complete specs** and are the
authority on intent. Layer 4+ (`web/`) is the build. When code and spec disagree,
the spec states the intent — but verify against code before assuming either is current.

---

## 3. Stack

- **Next.js 15 App Router** + **React 19**, TypeScript strict
- **Postgres + Drizzle ORM** (`pg`, not edge-compatible — see `serverExternalPackages`)
- **Redis** (`ioredis`) — caching, rate limiting
- **Auth:** `jose` JWT, mobile+OTP, cookie sessions
- **Forms:** React Hook Form + Zod · **Client state:** Zustand + TanStack Query
- **i18n:** `next-intl` (`src/i18n`, `messages/`) · `date-fns-jalali`
- **Tests:** Vitest + Testing Library (unit), Playwright + axe-core (e2e/a11y)
- **Deploy:** Docker image `ghcr.io/am1eza/iron-web:<sha>` behind Caddy.
  A secondary Cloudflare Workers target exists (`open-next.config.ts`, `wrangler.jsonc`) —
  assumptions valid for the Docker target are **not** automatically valid there.

### Architecture notes that bite
- **Server Components by default.** `"use client"` only for genuine interactivity.
  Secrets live in route handlers / server only — never in a client bundle.
- **`middleware.ts` runs on the Node runtime** (`export const runtime = 'nodejs'`) so it
  can query Postgres for redirects. It caches redirects in a module-level `Map` — valid
  because the Docker deploy is one long-lived Node process. **Not valid on Workers.**
- **The admin panel lives only on `panel.ahantime.com`.** On the public host, `/admin/*`,
  `/api/admin/*` and `/panel-login` are rewritten to a hard 404 — hidden, not redirected.
  Gated on `AUTH_ENFORCED`, which **fails closed**: enforced unless explicitly set to
  `false`, and always enforced under `NODE_ENV=production`. Local dev must set
  `AUTH_ENFORCED=false` to reach `/admin` without the panel subdomain. It used to
  default to off, which is how the Cloudflare Workers target — where the variable was
  never set — served the real admin shell unauthenticated on `*.workers.dev`.
- **`notFound()` returns HTTP 200** in this Next version when thrown inside an already-matched
  route. That's why unauthorized admin access is handled by a **rewrite to `/__admin_denied__`**
  in middleware rather than by `notFound()` alone.
- **Security headers are set in `next.config.mjs`'s `headers()` and NOWHERE ELSE.** They were
  once duplicated in middleware, which is how `X-Frame-Options` drifted to two conflicting
  values. Do not reintroduce a second source.
- **URL segments are ASCII** (`/prices`, `/account`) — Next's App Router does not reliably
  match non-ASCII folder segments, so the Persian-slug plan was abandoned. `src/lib/routes.ts`
  is the single source for every in-app URL; never hardcode a path. Persian appears in labels
  and content only. Verified: `find src/app -type d` has zero non-ASCII entries, and live
  `/قیمت` → 404 while `/prices` → 200.
  > `web/ROUTING.md` still documents the abandoned Persian-slug scheme and its entire URL
  > table 404s. `middleware.ts`'s comment about "Persian-path auth gating" is likewise
  > vestigial. Do not trust either on this point.

---

## 4. Working conventions

### Commits
Format: `type(US-XX.X): short description` — `type` ∈ `feat|fix|security|backend|chore|docs|perf|test`,
referencing story ids from `product/epics-user-stories-v2.md`.

### The git index is shared, mutable state
Multiple agents may work this tree concurrently. **Never `git add -A` or `git add .`.**
A sibling's `git add` can land between your own two tool calls and a bare `git commit`
would fold their unrelated work into your commit.

**Commit atomically with explicit paths:**
```bash
git commit web/src/foo.ts web/src/foo.test.ts -m "fix(US-12.3): ..."
```
This bypasses the index for those files entirely — no race window. Before starting and
before committing, run `git status --porcelain=v1 -- web` and `git log --oneline -10`.

### The drizzle migration journal is a second collision point
`web/drizzle/meta/_journal.json` is append-only and shared. If a sibling generated
migration N but hasn't committed the `.sql`, and you generate N+1, committing the
journal alone breaks `drizzle-kit migrate` for everyone. Diff it against
`git show HEAD:web/drizzle/meta/_journal.json` before committing; if it references a
tag whose `.sql` is untracked, commit that migration's SQL + snapshot too.

### No Node on the host PATH
There is no local `node`/`npm`/`pnpm`/`npx`. `web/node_modules` **is** installed on disk.
Run tooling through Docker:
```bash
docker run --rm -v /opt/ahantime:/app -w /app/web node:20 sh -c "./node_modules/.bin/tsc --noEmit"
```
Swap the binary for `vitest run`, `next lint`, `next build`, `drizzle-kit generate`.
> **Trap:** use `node:20`, not `node:20-alpine`, for builds.

### Before writing a new file
Check whether it already exists. A sibling agent (usually BE/DEVOPS for infra-adjacent
work) may have already built it to a matching contract. Read it fully and adapt rather
than overwrite.

### Docs can be stale
`docs/PRODUCTION-AUDIT.md` has listed already-fixed items as open. **Verify every claim
in any audit/roadmap doc against the actual code** before scoping work off it.

---

## 5. Deploy

Auto-deploy **works now.** It used to fail at the SSH step because
`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` were unset; the owner has since set them.
Observed on `main@f330abe` (1405/05/29): merging a PR ran `Deploy to production server`
→ both `build` and `deploy` green, and `ahantime-web-1` was already running the new tag
before anyone touched this host. **So check what is deployed before assuming you must
deploy it** — `docker inspect ahantime-web-1 --format '{{.Config.Image}}'` against
`git rev-parse origin/main`. The manual recipe below is still correct, and still the
fallback when the workflow does fail.

Known-red and **not** caused by your change (confirmed across many commits):
`Deploy preview to GitHub Pages` (a job literally named `build` — do not confuse it with
the GHCR `build` job in `deploy.yml`, which must be green) and
`Workers Builds: ahantime` (the secondary Cloudflare target; red on `main` independently
of any PR). `CI / checks` and `CI / e2e` were long-standing flakes but have been green
since #208 — treat a failure there as real until proven otherwise.

**Manual deploy on this host:**
```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/ahantime_deploy -o IdentitiesOnly=yes" git push origin main
docker pull ghcr.io/am1eza/iron-web:<full-sha>
docker image inspect ghcr.io/am1eza/iron-web:<full-sha>     # MUST succeed before the next line
sed -i 's#^WEB_IMAGE=.*#WEB_IMAGE=<image>#' /opt/ahantime/.env
docker compose up -d web
```
Never pipe the pull to `tail` — a masked failure once pointed `.env` at a missing tag.

**Verify (port 3000 is not host-exposed — go through Caddy):**
```bash
curl -sk --resolve ahantime.com:443:127.0.0.1        https://ahantime.com/          # 200
curl -sk --resolve panel.ahantime.com:443:127.0.0.1  https://panel.ahantime.com/    # 307 → login
curl -sk --resolve ahantime.com:443:127.0.0.1        https://ahantime.com/admin     # 404
docker exec ahantime-web-1 grep -rl '<a string you just shipped>' .next/
```
Always run a full `next build` in Docker before pushing.

---

## 6. Quality gates (definition of done)

- TypeScript **strict**; ESLint (`next/core-web-vitals` + `next/typescript`); Prettier
- Stylelint enforces **tokens-only** styling and **CSS logical properties** (RTL safety)
- Vitest unit/component · Playwright e2e · **axe** a11y
- **WCAG 2.2 AA** (`design/accessibility.md`)
- Budgets: **LCP < 2.5s · TTFB < 0.8s · CLS < 0.1**

### Styling rules that reviewers enforce
- Semantic tokens only (`--color-*`, `--t-*`, `--space-*`) — never raw values, never primitives
- Logical properties only (`margin-inline-start`, not `margin-left`)
- **One amber action per view.** Cobalt = interactive. Green/red **only** in data.
- No glassmorphism, no gradients, small radii. It must never look AI-generated.
- Persian typography: ZWNJ where required, tabular numerals for all data.

---

## 7. Operational context

- **GlitchTip** (error tracking) on port **9443** — there is **no wildcard DNS**, so don't
  assume a subdomain resolves.
- **Matomo** for analytics (self-hosted, with MarketingCampaignsReporting). Only
  `/mt/matomo.js` and `/mt/matomo.php` are proxied on the public origin; everything else
  under `/mt/*` is a deliberate 404. The admin console is the `:8443` host, not `/mt/`.
- **Editing `Caddyfile` does NOT reach Caddy.** It is bind-mounted as a *single file*, so
  any editor that writes-then-renames gives the host path a new inode while the container
  keeps the old one — `caddy reload` then reports `config is unchanged` and you can spend
  a long time debugging a fix that was never loaded. Confirm with
  `docker exec ahantime-caddy-1 grep <your-change> /etc/caddy/Caddyfile`; if it is absent,
  `docker compose up -d --force-recreate caddy` (≈2s edge blip). Always
  `caddy validate` first — a bad config takes the whole site down.
- **restic** backups via `ops/ahantime-db-backup.sh`.
- **OTP delivery slowness is provider-side (SMS.ir)**, not a code bug. There is a 2-stage
  watchdog. Do not "fix" it by swapping providers.

## 8. Hard stops — never do these unprompted

- Change payment/financial logic (there is no online payment; if that changes, it is a
  human decision)
- Delete data, drop tables, or write a destructive migration
- Anything that logs out or blocks existing users (rotating `JWT_SECRET`/`SESSION_SECRET`,
  changing cookie names or scope, invalidating sessions)
- Swap the SMS provider
- Commit `.env` or echo its contents
- Add a CDN, web font, or external script (Iran reachability)
- Introduce a UI framework or component kit
