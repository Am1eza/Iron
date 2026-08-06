# `/blog` + `/news` audit — fix pass

**Branch:** `fix/blog-news-audit` (from `main` @ `71b6274`)
**PR:** https://github.com/Am1eza/Iron/pull/70 — **draft, not merged, not deployed**
**Date:** 1405/05/15 (2026-08-06)

Nine commits. Every fix below maps to a numbered finding in one of the four audit
reports. Where I concluded an audit finding was *wrong*, that is stated plainly
rather than quietly dropped.

---

## 1. What was fixed

### Security

| Audit finding | What was wrong | Fix | Commit |
|---|---|---|---|
| **HIGH-1** `seo.canonical` accepts off-site URLs | The admin PATCH schema validated with `/^\//` — "starts with a slash", which `//evil.com` and `/\evil.com` both do, and both resolve to `https://evil.com/` in `buildMetadata`'s `new URL(path, SITE_URL)`. The value was published as the article's `<link rel="canonical">` **and** its `og:url`: a silent, durable ranking/traffic hijack that leaves the page rendering perfectly and survives republishing | Three layers. New parser-based `web/src/lib/utils/url.ts` (`isInternalPathValue`); `internalPathSchema` uses it (it only rejected `//` and `://`); `seo.canonical` uses that schema instead of its own weaker regex; and `buildMetadata` asserts the resolved origin and **drops** the canonical otherwise, so no caller's mistake can reach the sink | `b39a462`, `a7c61ba` |
| **MEDIUM-1** `%2F` bypasses the hard-404 guard | `shouldNotFound` decoded the pathname *before* testing it, so `/blog/aaa%2Fbbb` became the two-segment `/blog/aaa/bbb`, matched no guarded pattern, and fell through to `/blog/[slug]` — where `notFound()` replies 200 in this Next version and the route's `revalidate` caches the ghost behind a ~365-day `stale-while-revalidate`. Unlimited unauthenticated cacheable pages, 2 Postgres reads + a full render each | Judge **both** the raw and the decoded pathname. Every fail-open property in the docstring is preserved | `bddc10f` |
| **MEDIUM-2** `safeHref` classifies off-site links as internal | `/\evil.com`, `/\/evil.com`, `/<TAB>/evil.com`, `/<CR><LF>/evil.com` all start with one slash and all resolve to `https://evil.com/` — rendered with `rel="noopener"` only, so no `nofollow`, no `noreferrer`, and link equity to the attacker. `isExternal` (`/^https?:\/\//`) additionally missed `https://ahantime.com@evil.com/`. `normalizeImageSrc` had the same gap | All three resolve through the URL parser and reject the characters that exist only to confuse it, rather than silently rewriting an editor's input. `isExternal` also stops calling our *own* absolute URLs external | `de74c54`, `a7c61ba` |
| **LOW-1** no rate limit on the public article routes | 40/40 consecutive requests returned 200 while `/api/search` correctly 429'd. The `Cache-Control` on them buys nothing — Caddy does not cache and `?page=` varies the key — so every request reached Postgres | 60/min on `/api/articles` and `/api/articles/{slug}`, before any DB work | `0545fd9` |
| **LOW-2** `?page=1e30` → unhandled 500 | `Number('1e30')` is finite, so `Math.max(1, …)` accepted it and `(page-1)*perPage` overflowed Postgres' bigint OFFSET. No detail leaked, but `reportError` fired — GlitchTip noise on demand | Clamped to 10 000, exactly as the admin sibling already does and documents | `0545fd9` |
| **LOW-3** no rate limit or quota on `/api/admin/upload` | Auth and magic-byte validation were correct; nothing bounded *how many* times a legitimate or compromised `content:write` holder could call it, at 5 MB into a volume on the DB host with no orphan cleanup | 30/min | `0545fd9` |
| **LOW-5** `robots.txt` advertises `/admin` | Every `/admin*` path is already a hard 404 on the public host and a 404 is not indexable, so the line did no work — while being the first thing a recon tool reads | Dropped. `Disallow: /api` stays | `0545fd9` |
| **INFORMATIONAL-1** wrong claim in the CSP comment | "script-src only gates JavaScript-MIME-type scripts" is not true — it is evaluated against `<script>` elements regardless of `type` | Comment corrected, with the consequence spelled out for a future tightening | `0f4d41e` |

Three of these were the **same underlying mistake** — a `^\/`-style regex deciding a
question only the URL parser can answer. They now share one helper, which is what
the security audit's closing note asked for.

### Backend / performance

| Audit finding | Fix | Commit |
|---|---|---|
| **F1 (High)** `/blog` and `/news` declared `revalidate = 600` and were **fully dynamic** — they `await`ed `searchParams`, which opts the route out of ISR in Next 15, so the export was dead code | Page number moved into the path (`/blog/page/2`); one shared `ArticleIndex` for both sections; legacy `?page=N` 308s to the path form; `generateStaticParams` on `[n]` (required — without it Next classifies the route fully dynamic and never caches it) | `62bc251` |
| **F2 (Medium)** `warm-cache.sh` warmed two pages that could not be warmed | They are genuinely ISR now, so the entries do what the comment claimed. Separately, `ROUNDS` was raised (see §3) | `62bc251`, `a7c61ba` |
| **F3 (Medium)** `SELECT *` on every list read; feeds paged the archive then sliced | `listPublished` projects the 12 columns `toArticleDto` reads; both feeds ask for page 1 with `LIMIT 50` | `62bc251`, `42aa3e3` |
| **F4 (Low/Med)** detail page ran a discarded `count(*)` and hydrated 20 fat rows to show 3 | New `relatedArticles`: one projected `LIMIT 3` | `62bc251` |
| **F5 (Medium, SEO)** out-of-range pages returned 200; page 2 self-canonicalised to page 1 | Out-of-range is now a real redirect, and every archive page self-canonicalises | `62bc251`, `a7c61ba` |
| **F6 (Medium, SEO)** sitemap `lastmod` ignored `updatedAt` | `updatedAt` first — editing a published article produced no recrawl signal at all | `42aa3e3` |
| **F7 (Low)** `og:type: website` on articles, no `article:*` tags | `og:type: article` + `published_time`/`modified_time`. JSON-LD was already correct | `42aa3e3` |
| **F8 (Medium, latent)** first body image lazy-loaded | `loading="eager"` + `fetchPriority="high"` on the first image only (see §4 for the parts of F8 not done) | `e3d0836` |
| **F9 (Medium, latent)** `/uploads/*` missing from Caddy's cache rules | Added to the Caddyfile as `immutable` (ULID filenames are never reused), before the first upload rather than after | `42aa3e3` |
| **F11 (Medium)** no fallback if Postgres is slow | `error.tsx` for both sections, scoped to the index via a `(index)` route group | `62bc251`, `a7c61ba` |
| **F13 (Low)** scheduled publishing has no cache invalidation | Cannot be fixed here — see §3. `publishDueArticles` now returns what it published and logs it; the panel publish path additionally purges the article's own URL and the sitemap | `42aa3e3` |

### UI / UX / accessibility

| Audit finding | Fix | Commit |
|---|---|---|
| **B1 (Critical)** `text-align: justify` on Persian body copy | → `start`. Persian has no hyphenation and browsers do not apply kashida, so justification only stretched word-spacing: 76 chars/line desktop, 43 mobile, rivers at both. Plus `text-wrap: pretty` / `balance` | `e3d0836` |
| **C1 (Critical)** `/blog?page=99` returned 200 telling the visitor the blog is empty | Real redirect to the section index (see §3 for why not a 404) | `62bc251`, `a7c61ba` |
| **E1 (High)** footer column titles are `<h2>` | → `<p>`. Seven footer headings per page, one of them «مقالات» competing with the content section; the grouping is already carried by `<nav aria-label>` | `e3d0836` |
| **E2 (Medium)** breadcrumb targets 23×21 / 29×21 px | Padded to a 24 px minimum (WCAG 2.2 SC 2.5.8; the spacing exception does not apply at a 4 px gap) | `e3d0836` |
| **E3 (Medium)** whole-card link produces a ~35-word accessible name | Link moved to the title, stretched over the card by a `::after` overlay. Name is the title alone; hit area unchanged; focus affordance moved to `:focus-within` | `e3d0836` |
| **G2 (Medium)** card hover has no transition | **The audit is wrong** — `.card` already had a 3-property transition. Added the missing `prefers-reduced-motion` guard instead | `e3d0836` |
| **G5 (Medium)** `/blog` and `/news` page components byte-identical | One `ArticleIndex` with a copy table. This was a prerequisite for F1 anyway | `62bc251` |
| **G4 (Medium)** unused `Badge` import / dead card scaffolding | The unused import went with the component merge | `62bc251` |

---

## 2. What the three review passes found, and what I did about it

Three independent agents reviewed `71b6274..0f4d41e` — adversarial security, correctness/regression, and performance. **None of them broke a security fix**: a 400,000-iteration fuzz over the URL helpers found zero escapes, the `%2F` guard did not re-open under `%252F`/case/unicode-slash/`;`-param variants, and all **252 live `redirects` rows** still validate against the stricter `internalPathSchema`. Everything real they *did* find is fixed in `a7c61ba`:

| Found | Severity | Action |
|---|---|---|
| `isInternalPathValue` accepted `//evil.com:80@ahantime.com/` — resolves to this origin (userinfo), so not a hijack, but the address bar reads `evil.com:80@ahantime.com` | Low | Rejected; regression test added |
| The `?page=` redirect used `url.search = ''`, **permanently** stripping `utm_*`/`gclid` from every newsletter and ad link into the archive | Medium | Only `page` is consumed; junk values get a 307 so browsers do not cache a permanent redirect keyed on unbounded input |
| `archiveRedirect` ran *before* the redirect table, shadowing any admin-configured row for `/blog`/`/news` (none exist today — all 126 rows are `/prices/*`) | Low | Moved after it |
| An indexed `/blog?page=2` 308'd straight into a hard 404 | Medium | The guard now **307s** `*/page/*` to the section index rather than 404ing it. Also closes the window where a newly crossed page boundary 404s while `/blog`'s own pager links to it |
| `blog/error.tsx` was a segment-wide boundary, so a single failing article showed «فهرست مطالب در دسترس نیست» and mislabelled GlitchTip | Medium | Index moved into a `(index)` route group |
| Both detail pages call `getArticle` from `generateMetadata` **and** the body — 3 scans per cold render, one pure duplication | Medium | `getArticle` wrapped in React `cache()` |
| `warm-cache.sh` probed `WORKERS+3` rounds. Full coverage of W workers by N probes is `W!·S(N,W)/Wᴺ` — at W=5, N=8 that is **≈0.32**, and each worker needs *two* hits. Roughly two thirds of deploys left a worker serving the build-time page | Medium | `WORKERS*3+3` rounds at a shorter pause; feeds added to the probe list (their build-time artifact is an **empty feed**) |
| A no-op `cache()` whose comment claimed it deduped a query `generateMetadata` never issues; dead `getArticlesByType`; stale `RSS_ITEM_LIMIT` and publish-job comments; inert `.card:hover` rule; `toArticleDto` cast instead of typed; `publishedArticlePaths` now returns archive URLs but was still named/documented as article paths | — | All cleaned up; the repo function renamed `publishedGuardPaths` so a future sitemap caller cannot mistake it |

One review finding I **deliberately reversed after checking it**: the security pass
flagged that `/blog/rss%2Exml` hard-404s under the new raw-form guard. I measured
that URL against production and it returns **HTTP 500** ("Invariant app-page handler
received invalid cache entry APP_ROUTE" from Next's own router, reported to
GlitchTip). Guarding it turns an unauthenticated 500-on-demand into a clean 404,
and the canonical spelling — the only one anything links — is untouched. So the
guard stays, with the measurement written into the code.

---

## 3. Verification

All via Docker (`node:20`), per CLAUDE.md §4.

| Gate | Result |
|---|---|
| `tsc --noEmit` (strict) | **clean** |
| `next lint` | **0 errors**; warnings byte-identical to `main` |
| `stylelint 'src/**/*.css'` | **clean** |
| `vitest run` | **1168 / 1168 passed, 106 files** (was 1082 on `main`) |
| `next build` (production) | **exit 0** |

Regression tests added for every security fix: 49 adversarial cases over
`safeHref`/`isExternal`/`normalizeImageSrc` (each first checked against what
`new URL()` actually resolves the string to), the `%2F` bypass and its fail-open
properties, the canonical sink and the `internalPathSchema` boundary, the
pagination bounds and redirect-loop safety, and the card's accessible name.

### Caching fix — before/after, measured

Production build of this branch pointed at the **real database**, versus the live
deploy of `main` through Caddy.

**Headers**

```
main    /blog   cache-control: private, no-cache, no-store, max-age=0, must-revalidate
branch  /blog   cache-control: s-maxage=600, stale-while-revalidate=31535400   (x-nextjs-cache: HIT)
```

Build manifest: `ƒ /blog` (dynamic) on `main` → `○ /blog` (static, 10m/1y) on this
branch, plus `● /blog/page/[n]`.

**Postgres reads** — `seq_scan+idx_scan` delta on `articles`, with an idle baseline
subtracted (idle drift over 10 s was 0):

```
50 × /blog on production (dynamic) → +100 scans   (2.0 per request)
50 × /blog on this build   (ISR)   → +0
```

An independent measurement by the performance reviewer: `/blog` 2.05 → 0.05
scans/request, `/news` 2.00 → 0.00, cold article detail render 4 → 3 (now 2 with
the `cache()` on `getArticle`).

**Throughput** — 200 requests at concurrency 20:

```
production /blog (dynamic, 5 workers + TLS)   47.2 rps   p95 743 ms
production /blog/<article> (already ISR)     166.5 rps   p95 117 ms
this build /blog (ISR, 1 worker, no TLS)     166.7 rps   p95 143 ms
```

**Honest attribution.** My own single-worker number flatters the branch (no TLS,
no cluster). The reviewer ran a control: `/prices`, a route identical in both
builds, was ~19 % *slower* on the branch build — i.e. ambient conditions favoured
`main`, so the gain is not an artifact. At concurrency 1 the p50 goes 55.5 ms →
5.7 ms, which is the render plus two Postgres round-trips ISR now skips.
**The production-shaped estimate is ~3.5×**, matching the 3.1× the audit measured
between the dynamic index and the already-ISR'd article page.

**Row width** (`EXPLAIN (ANALYZE, BUFFERS)`): `SELECT *` width 1631, `shared hit=6`
→ projected width **322**, `shared hit=3`. The three dropped buffers are the TOAST
reads for `body_md`/`body_json`.

### Behaviour, verified live against the real database

```
/blog                              200  s-maxage=600, stale-while-revalidate=31535400
/news                              200  s-maxage=600, stale-while-revalidate=31535400
/blog/page/2  (does not exist yet) 307 → /blog
/blog/page/999                     307 → /blog
/blog/page/1                       308 → /blog
/blog?page=2&utm_source=telegram   308 → /blog/page/2?utm_source=telegram
/blog?page=abc&utm_source=x        307 → /blog?utm_source=x
/blog/aaa%2Fbbb                    404          (was 200 + s-maxage=600 on production)
/news/x%2Fy                        404          (was 200 + s-maxage=600)
/blog/rss.xml                      200
/blog/rss%2Exml                    404          (500 on production)
/blog/nope                         404
/blog/steel-weight-guide           200  s-maxage=600, stale-while-revalidate=31535400
```

---

## 4. Deliberately NOT fixed

### Not a defect — content/editorial

- **The rich editor's tables/charts are unused in all 7 live articles** (UX A1/A2, and
  the flagship «جدول وزن مقاطع فولادی» containing no table). Excluded by instruction,
  and correctly so: it is a content gap, not a code defect. No published article was
  edited.

### Feature requests, not bugs — for the owner to greenlight separately

From the UX and creative-research audits. None of these is a defect; each is new
product work with its own design decisions:

- Native Telegram / WhatsApp / Eitaa share buttons, and «ارسال به کارفرما» (F2)
- Per-article generated OG images (A5, creative §9) — note the audit's warning that
  Satori cannot shape Persian; this needs headless Chromium at publish time
- Persian TTS via Piper (creative §12)
- Table of contents, reading progress, read time, sticky reading rail (D1, D2)
- Tag taxonomy, filter chips, tag archive pages, content↔price cross-links (C2, creative §1)
- Genuinely *related* related-articles ranking (D3) — the fix here made the existing
  recency behaviour cheap, it did not change what "related" means
- In-article price alerts, advisor deep-links, live-data chart nodes (creative §2–§5)
- Dark-mode switch (F5), comments / «سؤال از تحریریه» (F3), SMS digest (F4)
- Featured-card editorial grid (C3), cross-section strips (C5), prev/next (D4),
  author entity page (D5), visible update dates (D6), loading skeletons (G3)

### Real, but deliberately deferred with reasons

- **F12 — the `(type, publish_at DESC) WHERE status='published'` index.** Needs a
  migration, and `web/drizzle/meta/_journal.json` is shared append-only state
  (CLAUDE.md §4) with a sibling worktree active on this server right now. At 7 rows
  it changes nothing measurable. **This is the one thing I'd queue next** — the
  performance review confirmed the archive/related queries are Sort-over-filter and
  will stay that way at scale.
- **F13 — instant cache invalidation for *scheduled* publishing.** Not fixable in
  code here: the scheduler runs as its **own process** (`scripts/jobs.ts`), so
  `revalidatePath` has no rendering context and would silently no-op; and the ISR
  cache is per-worker across `WEB_CONCURRENCY` forks, so even in-process it would
  purge one worker of five. The honest bound is the routes' own `revalidate = 600`,
  which is written into the job. **This is a genuine behaviour change worth your
  sign-off:** a scheduled article now appears within ten minutes instead of
  immediately (the indexes were previously uncached only *by accident*). Making it
  instant needs a shared Redis-backed Next cache handler — a deployment change.
- **F8 in full — server-side image dimensions.** The client-side `measureImage()`
  probe with a `?? null` fallback remains the only source, and the cover's
  hardcoded `1200×630` remains. On the cover I checked the audit's claim and **it is
  wrong**: `article.module.css` pins `aspect-ratio: 1200/630` with `object-fit:
  cover`, so the box is reserved and there is no layout shift — only a crop. The
  body-image backstop is real but needs a header parser and a change to the upload
  response contract; it is unexercised today (zero images in any published article).
- **B2 — one `Intl.NumberFormat('fa-IR')` for the ticker's mixed separators.** Real
  inconsistency, but the formatter is site-wide (every price on every page), so this
  is a global change that wants its own branch and its own snapshot tests, not a
  rider on a blog/news security fix.
- **B3, B5, G1, G6, C4, C6, E4** — verbose/relative Jalali dates, the article heading
  scale, the `design/tokens.css` ↔ CLAUDE.md palette drift, footer weight, section
  naming, RSS discoverability, table-caption labelling. All design/editorial
  decisions rather than defects.
- **G7 — `/prices/sheet` prefetching a 404 from the mega-menu.** Real bug, but the
  audit itself scopes it out, and locating it properly means untangling which nav
  source the live mega-menu reads (`MOCK_CATEGORY_SUBS` is explicitly *not* the live
  taxonomy). It deserves its own investigation rather than a guess inside this PR.
- **Workers deploy target:** `rateLimit`'s `BINDING_BY_SCOPE` has no entry for the new
  `articles`/`upload` scopes, so on the secondary Cloudflare target those limits fall
  back to a per-isolate window. The Docker deploy is unaffected (Redis is
  authoritative). Flagged rather than fixed, since that target's bindings live in
  `wrangler.jsonc` and are a deployment decision.

### Audit findings I checked and concluded were wrong

- **UX G2** — "card hover jumps with no transition". `.card` already had a
  three-property transition. Only the `prefers-reduced-motion` guard was missing.
- **UX/Backend F8 cover claim** — "the reserved box is wrong and the layout shifts".
  The CSS pins the aspect ratio; the picture is cropped, not shifted.
- **Backend F3 for the feeds, at current scale** — `getAllPublishedArticles` breaks
  out on page 1 with 4 rows, so `main` already issued exactly 2 queries. The bound is
  real *at scale*; it saves nothing today.

---

## 5. Deploy notes

Nothing here has been deployed. Two things a deployer must know:

1. **`Caddyfile` changed.** It is bind-mounted as a *single file*, so an edit does not
   reach the container (CLAUDE.md §7). Verify with
   `docker exec ahantime-caddy-1 grep uploads /etc/caddy/Caddyfile`; if absent,
   `caddy validate` then `docker compose up -d --force-recreate caddy`.
2. **The first visitor after a deploy.** `/blog` and `/news` are now `○ Static`, so
   the build (which has no `DATABASE_URL`) bakes a copy rendered from `lib/mock`.
   That is the same trade `/` and `/prices` already make, and `ops/warm-cache.sh` is
   what absorbs it — which is why its round count was raised in this branch. Today
   the fixtures happen to match the live rows; the exposure arms with the 8th
   article. Run `warm-cache.sh` after `docker compose up -d web`, as usual.

I did not touch `.claude/worktrees/seo-keyword-tools`, did not generate a migration
(shared journal), and did not edit the content of any published article.
