# Historical reports — experience

These are historical snapshots, consolidated on 2026-09-06. Deployment, test, price and open-item claims apply to their original reporting context, not the current system. Original report bodies and decisions are retained; verify operational commands against the current runbooks before use.

[Documentation index](../README.md)

## Reports
- [AGENT_REPORT_b2b_badge.md](#agent-report-b2b-badge)
- [AGENT_REPORT_blog_news_audit.md](#agent-report-blog-news-audit)
- [AGENT_REPORT_phase1_advantages_i18n.md](#agent-report-phase1-advantages-i18n)
- [AGENT_REPORT_seo_keyword_tools.md](#agent-report-seo-keyword-tools)
- [AGENT_REPORT_upload_retry.md](#agent-report-upload-retry)
- [AGENT_REPORT_ux_audit_p0.md](#agent-report-ux-audit-p0)
- [UX_P0_AUDIT_FINAL_SUMMARY.md](#ux-p0-audit-final-summary)

---

<a id="agent-report-b2b-badge"></a>

## Source: `AGENT_REPORT_b2b_badge.md`

# AGENT_REPORT — surface business-account verification as a visible benefit

**Branch:** `worktree-b2b-badge` · **Scope:** UI + copy only. No schema change, no new
column, no migration, no pricing logic.

## What already existed (unchanged)

`users.company_name` / `company_national_id` / `economic_code` / `biz_verify_status`,
`POST /api/me/verification`, `VerificationCard`, `VerificationReview`, `verificationRepo`.
A customer could already submit company details and be admin-approved to level 3. What was
missing was any sign of it afterwards — the approval was invisible to both the customer and
the sales rep.

## What was added

| # | File | Change |
|---|---|---|
| 1 | `web/src/lib/data/verification.ts` | New exported constant `BUSINESS_ACCOUNT_LABEL = 'حساب سازمانی تأییدشده'` — one string, three surfaces. Rewrote the level-3 `unlocks` list (see "copy" below). |
| 2 | `web/src/components/account/BusinessAccountBadge.tsx` (new) | The badge itself: `Badge tone="success"` + `ShieldIcon`, showing `«حساب سازمانی تأییدشده · <نام شرکت>»` when the company name is known, the bare label otherwise. |
| 3 | `web/src/app/account/[[...tab]]/page.tsx` | Account page **header**: renders the badge next to the role badge when `bizVerifyStatus === 'approved'`. The session token has no verification state, so the header does one PK-indexed `getUserProfile` in live mode. |
| 4 | `web/src/components/account/VerificationCard.tsx` + `.module.css` | The level-3 "maxed" state was one grey sentence and a `بالاترین سطح احراز` badge. It is now the business badge (with the company name) plus a one-line note saying the sales rep sees this when reviewing an inquiry. New optional prop `verifiedCompanyName` (named to avoid colliding with the existing `companyName` form-state in the same component). |
| 5 | `web/src/app/api/admin/leads/[id]/route.ts` | `GET` now also returns `customer: { companyName, bizVerified: true } \| null` — one extra indexed select, only when `lead.userId` is non-null, and `null` unless the account is `approved`. |
| 6 | `web/src/lib/api/resources/admin.ts` | Typed that new `customer` field on `adminApi.lead`. |
| 7 | `web/src/components/admin/leads/LeadDetail.tsx` | Sales side: the same badge in the lead's identity header, next to «شمارهٔ تأییدشده». |
| 8 | `web/src/lib/data/verification.test.ts` (new) | Guard test: **no level's copy may contain** تخفیف / درصد / عمده‌فروشی / اعتباری / قیمت ویژه / ارزان. |
| 9 | `web/src/components/account/BusinessAccountBadge.test.tsx` (new) | Badge renders with and without a company name (blank/whitespace falls back). |

## Copy: the honest "why verify"

The brief asked for a concrete reason to verify. Two of the claims it suggested turned out
**not** to be backed by code, so neither was used:

- **"Higher priority handling"** — there is no priority score anywhere. `verificationRepo.ts`
  has no scoring at all; the only thing `bizVerifyStatus` feeds is `clubPoints.ts`
  (`level3: 3` points vs `level2: 2`). Not claimed.
- **"Your company appears on the official پیش‌فاکتور"** — the proforma letterhead
  (`club_memberships.letterhead_*`) is gated on **club tier `poolad`**, not on business
  verification (`src/app/proforma/[ref]/page.tsx:50`), and the proforma does not print the
  verified company as the buyer at all. The link is only indirect (level 3 → +3 club points
  → helps reach پولادی). Too weak to state as a benefit; not claimed.

I also **removed two pre-existing false claims** from the level-3 list, because making the
badge visible would have amplified them:

- `قیمت و شرایط عمده‌فروشی` (wholesale pricing/terms) — no tier-pricing mechanism exists.
- `امکان خرید اعتباری` (credit purchase) — no credit limit exists anywhere in the codebase.

The level-3 list now reads (each line backed by real behaviour):

1. `نشان «حساب سازمانی تأییدشده» روی حساب شما` — items 2–4 above.
2. `کارشناس فروش هنگام استعلام می‌بیند که کسب‌وکار شما تأییدشده است` — items 5–7 above.
3. `مشخصات شرکت برای صدور فاکتور رسمی شرکتی ثبت و آمادهٔ استفاده است` — the identifiers are
   stored and approved; the invoice itself is the existing human/offline process.
4. `بیشترین امتیاز احراز در باشگاه مشتریان` — `clubPoints.ts` `level3: 3`.

## Explicit confirmation: no pricing or discount claim was introduced

**No file in this change adds, implies or hints at a price, discount, percentage, volume
tier or credit facility.** The net effect on money-related copy is *negative*: two unbacked
claims were deleted and none added. `verification.test.ts` now fails CI if any is
reintroduced. No pricing code, no `current_prices`, no proforma totals and no club weights
were touched.

## Verification run

- `tsc --noEmit` — clean apart from three pre-existing `*.png` module errors that appear in
  any fresh worktree (the gitignored generated `next-env.d.ts` is absent); unrelated to
  these files.
- `vitest run` on the three relevant test files — 12 passed (including the untouched
  `LeadDetail` suite, which still passes with the mock that omits `customer`).
- `next lint` on all seven touched source files — clean. `stylelint` on the touched CSS
  module — clean.
- Full `next build` in Docker — see the PR checks.

The full unit suite was deliberately **not** run on this host (past OOM); CI runs it.

## Out of scope (deliberately left alone)

- Level-2 copy still promises `سقف سفارش بالاتر`, which is also unimplemented — not a money
  claim, and out of this pass's scope.
- Any actual B2B pricing/discount tier. That needs the owner's numbers and is tracked
  separately.

---

<a id="agent-report-blog-news-audit"></a>

## Source: `AGENT_REPORT_blog_news_audit.md`

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

---

<a id="agent-report-phase1-advantages-i18n"></a>

## Source: `AGENT_REPORT_phase1_advantages_i18n.md`

# Phase 1 — homepage competitive advantages + translation completeness

Branch: `worktree-phase1-advantages-i18n`

Two independent pieces of work, both scoped by the owner's audit:

- **Part A** — a dedicated «چرا آهن‌تایم» competitive-advantage section on the homepage.
- **Part B** — a quality pass over the `en`/`ar`/`zh` dictionaries, plus routing the
  static marketing copy that was hardcoded Persian through `next-intl`.

---

## Part A — «چرا آهن‌تایم» on the homepage

### New files

| File | What it is |
|---|---|
| `web/src/components/home/WhyAhantime.tsx` | The section: a 6-card grid, one card per confirmed advantage. |
| `web/src/components/home/WhyAhantime.module.css` | Its styles — tokens only, logical properties only. |

It is placed in `web/src/app/page.tsx` between `CompareTeaser` and `ValueProps`.
That position is deliberate: the section answers *what this marketplace does that a
plain price list does not*, which belongs before `ValueProps` explains *how a purchase
runs* and before `Partners` shows *who already buys*. Visually it takes the plain page
surface with a hairline card grid, so it separates cleanly from `ValueProps`
(`--color-surface-sunken`) above and the dark blueprint `Partners` block below,
without inventing a new visual language. The icon treatment is copied verbatim from
`company/FeatureGrid.module.css`, the site's existing advantage-grid pattern.

### The six cards

| # | Card | Links to | What backs it |
|---|---|---|---|
| 1 | مشاور هوشمند، با حافظه | `/ai` | `ai_conversations` + `ai_corrections` — real conversation memory and a specialist correction loop. |
| 2 | پیش‌فاکتور رسمی آنی و تأمین با LC | `/prices` | The instant-proforma-by-SMS flow, بورس کالا/factory sourcing, LC for bulk. Framed as an advantage, not just a process step (it stays a step in `ValueProps` too — the two do not contradict). |
| 3 | انتخاب صنایع بزرگ | `/about` | The 21 client logos the `Partners` strip actually renders. |
| 4 | انبار مشتریان | `/warehouse` | `warehouse_items` / `warehouse_settlements`: monthly storage fee, insurance flag, contract ref, periodic settlement. Previously only a nav/footer link. |
| 5 | ابزارهای رایگان محاسبه | `/tools/project` | The 4 entries in `TOOLS_NAV`. |
| 6 | خدمات ویژهٔ B2B | `/tender` | The 4 entries in `SERVICES_NAV_FULL`. |

### Numbers

Every figure is computed server-side in `page.tsx` and passed in as `stats`. Nothing is
typed into the component, hardcoded, estimated or rounded:

- `skuCount` / `factoryCount` — the same live catalog values `HeroSearch` already uses.
- `clientCount` — `clientLogos.length` (**21** today), i.e. exactly the logos on screen.
- `toolCount` — `TOOLS_NAV.length` (**4**).
- `serviceCount` — `SERVICES_NAV_FULL.length` (**4**).

The lead paragraph is suppressed entirely when `skuCount` is 0, so an ISR render that
caught the DB cold never publishes a "0 products" sentence.

### Deliberately absent

Both exclusions are documented in the component's header comment so a later pass does
not reintroduce them:

- No "cheapest pipe price in the market" claim — unverified.
- No customer-club cashback — `club_memberships` has no cashback/refund column; the
  feature does not exist and needs its own design conversation.

---

## Part B — translation

### B1. Quality pass over the existing dictionaries

All 105 pre-existing keys were read key-by-key against the Persian meaning, not just
checked for key parity. The catalogues were in better shape than expected; the changes
made were:

| Key | Locale | Before → after | Why |
|---|---|---|---|
| `common.state.offline` | en | "You're offline" → "No internet connection" | Matches the fa meaning (the *connection* is down) and the formal register. |
| `common.state.stale` | en, ar | "Delayed" / «متأخر» → "Delayed data" / «بيانات متأخرة» | A bare adjective on a price badge reads as a delayed *shipment*; fa «با تأخیر» qualifies the data. |
| `nav.club` | en, ar | "Club" / «النادي» → "Customer Club" / «نادي العملاء» | "Club" alone is meaningless in a B2B nav. |
| `nav.content` | ar | «مقالات» → «المقالات» | Was an unarticled Persian-style noun; MSA nav labels take the definite article. |
| `nav.cooperation` | zh | 合作 → 商务合作 | 合作 alone is vague; 商务合作 is the standard B2B partnership label. |
| `common.nameLabel` | zh | 全名 → 姓名 | 全名 is a literal calque; 姓名 is the standard form-field term. |
| `phone.noCountry` | zh | 未找到国家 → 未找到相关国家/地区 | Matches `phone.country`, which already uses 国家/地区. |
| brand romanization | en, ar, zh | "Ahan Time" → "Ahantime" (71 occurrences) | The rest of the codebase and the domain both use one word; a visitor who reads "Ahan Time" cannot type the URL. |

### B2. Static copy moved out of hardcoded Persian

Newly translated across all four locales (**+62 keys**, 105 → 167):

| Where | Keys | Note |
|---|---|---|
| Homepage hero (`HeroSearch`) | `home.hero.*` | Includes the three starter chips — they are sent verbatim to the AI advisor as the visitor's own question, so they must be in the visitor's language. |
| «چطور کار می‌کند» (`ValueProps`) | `home.how.*` | |
| «چرا آهن‌تایم» (`WhyAhantime`) | `home.why.*` | New in Part A, translated from the start. |
| Mills + clients strip (`Partners`) | `home.partners.*` | Mill names themselves stay Persian — proper nouns, and the search links behind them match SKUs on that exact Persian string. |
| Category menu (`CategoryStage`) | `home.browse.*` | Chrome only; category names are DB data. |
| Compare card (`CompareTeaser`) | `home.compare.*` | Chrome only. |
| `/about` (`AboutContent`) | `about.*` | Whole page body, including the 8-item advantage grid merged in from the old `/why`. |
| `/contact` (`ContactIntro`) | `contactPage.*` | |
| Contact card (`ContactCardView`) | `contactCard.*` | |

Three components had to be restructured, because a Server Component cannot read the
client-side locale and an `async` component cannot carry `'use client'`:

- `app/about/page.tsx` → visible body extracted to `components/company/AboutContent.tsx`.
- `app/contact/page.tsx` → breadcrumbs + hero extracted to `components/company/ContactIntro.tsx`.
- `ContactCard` stays an async Server Component and does the `getContact()` fetch;
  its markup moved to `ContactCardView` (client).

`ValueProps` gained `'use client'` for the same reason. It has no state, no effects and
no observers, so it still server-renders to the same markup.

**Digits follow the locale.** `toPersianDigits` is now applied only when
`locale === 'fa'`; an English or Chinese reader sees `1059`, not `۱۰۵۹`. Same for the
step numbers in `ValueProps` and the phone numbers in `ContactCardView`.

**Deliberately left Persian** (judgement calls, per the brief):

- **Route `metadata` and all JSON-LD.** Metadata is generated at build time with no
  request context, and this i18n setup is cookie-based with no URL locale prefix — so
  there is exactly one static title/description per URL. Per-language metadata needs
  URL-prefixed locales first. The BreadcrumbList crumb labels stay Persian for the same
  reason (that is what a crawler sees on the single canonical URL); the *visible*
  breadcrumbs are translated.
- **`PriceBoard`** (the hero price panel). It is an async-fed Server Component whose
  content is Persian SKU names and a Jalali timestamp; translating its four chrome
  labels would produce a more incoherent panel, not a less one, and it is the hero's
  LCP element. Left as-is on purpose.
- **The office address** in `ContactCardView` — a half-translated Iranian postal address
  is worse than a Persian one a courier can read.

### Payload cost

`fa.json` grew 6.4 KB → 18 KB. Only the default locale ships in the initial payload;
`en`/`ar`/`zh` are lazy `import()` chunks `LocaleProvider` fetches on switch, so they
cost nothing until someone changes language. The homepage therefore carries roughly
**+11.6 KB uncompressed (~3.5 KB gzipped)** of text in an already-streamed payload —
the unavoidable price of the copy being translatable at all, and well inside the LCP
budget, which is dominated by fonts and images.

`ValueProps` and the new `WhyAhantime` are the only components that newly enter the
client bundle. Neither has state, effects or observers, and both already depend on
`next-intl`, which the header loads regardless.

### B3. New test

`web/src/i18n/messages.test.ts` (8 tests) pins what nothing enforced before. A missing
key does not fail the build — `next-intl` renders the key path as literal text
(`home.why.warehouse.title`) in the switched locale only, which is invisible from the
Persian default. It asserts:

1. every configured locale has a catalogue, and `fa` is the default;
2. `en`/`ar`/`zh` have exactly `fa`'s key set — no missing keys, no orphans;
3. every ICU placeholder survives translation (`{count}`, `{sku}`, `{factory}`…) —
   a dropped or renamed placeholder throws at render time in that locale alone;
4. no non-Persian catalogue contains Persian-only letters (پ چ ژ گ ی ک) — the signature
   of a Persian string pasted in untranslated, including the Persian ی/ک leaking into
   Arabic where ي/ك belong.

### Translation confidence, per language

- **English — high.** Reviewed and written directly; formal B2B register, industry terms
  checked ("proforma invoice", "letter of credit (LC)", "Iran Mercantile Exchange",
  "rebar", "I-beam", "cut-to-size").
- **Arabic — medium-high.** MSA business register throughout, not Persian cognates:
  «فاتورة أوّلية» for پیش‌فاکتور, «اعتماد مستندي» for LC, «بورصة السلع الإيرانية» for
  بورس کالا, «مستودع العملاء» for انبار مشتریان. Arabic ي/ك used, never Persian ی/ک
  (now test-enforced). Eastern Arabic numerals kept where the pre-existing keys already
  used them. **Worth a native check before a real Arabic campaign:** the marketing
  headlines rather than the functional labels — `home.why.clients.title`
  («خيار كبرى الصناعات»), `home.why.services.title` («خدمات مخصصة للشركات») and
  `home.why.eyebrow` («ما يميّز Ahantime») are the ones where register, not meaning,
  is the risk.
- **Chinese — medium-high.** Simplified characters, natural Chinese word order rather
  than transliterated Persian sentence structure; standard steel-trade terms
  (螺纹钢 rebar, 工字钢 I-beam, 型材 profiles, 形式发票 proforma, 信用证 LC,
  伊朗商品交易所 IME, 定尺 cut-to-size). **Worth a native check:** `common.unit.currency`
  = 土曼 for Toman — a rare enough loanword in Chinese that 图曼 or leaving it as
  "Toman" may read better to a mainland buyer; and `home.why.title`
  (为什么选择 Ahantime？) as a marketing headline.

I did not ship anything for Arabic or Chinese I could not read back and justify term by
term, but I am not a native speaker of either — the keys flagged above are where a
native reviewer's time is best spent.

---

## What is still Persian-only, and what full catalog translation would cost

### Now translated
Static UI chrome (nav, header, footer, forms, auth, errors) **plus** all static
marketing copy on the homepage, `/about` and `/contact` — 167 keys × 4 languages.

### Still Persian in every locale, by design for this pass
The live product catalog and editorial content. These are DB rows, not dictionary
strings; translating them is a **content project, not a code change** — it needs a
translation column or table per entity, an admin editing surface, a fallback rule for
untranslated rows, and (for anything to be indexable) URL-prefixed locales, which this
cookie-based setup does not have.

### Scope estimate — measured against the live DB today (2026-08-23)

| Content | Rows | Distinct strings | Persian characters |
|---|---:|---:|---:|
| `categories.name` (active) | 8 | 8 | 54 |
| `sub_categories.name` (active) | 69 | 68 | 785 |
| `sub_categories.group_label` (active) | 53 | 18 | 596 |
| `skus.name` (active) | 782 | 782 | 18,771 |
| `articles.title` | 122 | 122 | 7,167 |
| `articles.excerpt` | 122 | 122 | 19,706 |
| `articles.body_md` | 122 | 122 | **242,914** |
| `seo` JSONB blobs (all four tables) | 131 | — | not counted |

Plus 1,147 SKU rows in total (782 active), 121 published articles, and 84 distinct mill
names.

Read as two very different jobs:

1. **Catalog only** (categories + sub-categories + SKU names): **876 distinct strings,
   ~20k Persian characters.** Highly repetitive and formulaic — "میلگرد ۱۴ آجدار A3
   ذوب آهن اصفهان" — so it is mostly a glossary problem: build a term table for
   sizes, grades and mill names and most SKU names compose from it. Realistically a
   few days of work per language once the schema and admin surface exist, and the
   result is what actually makes the price tables usable to a non-Persian buyer.
2. **Editorial content** (122 articles, ~270k characters of title + excerpt + body):
   roughly **150–200 pages of prose per language**. This is a genuine translation
   budget, not an engineering estimate, and it is also the part with the least
   commercial return for a foreign B2B buyer, who comes for prices and a proforma.

**Recommendation:** if the owner greenlights anything beyond this pass, greenlight the
catalog glossary (job 1) and treat the articles (job 2) as separate and optional. Both
need URL-prefixed locales landed first, or the translations will not be indexable.

---

## Verification

- `tsc --noEmit` — clean.
- `next lint` on every touched file — clean.
- `stylelint` on `WhyAhantime.module.css` — clean (tokens-only + logical-properties rules pass).
- `prettier --check` — clean.
- `vitest run src/i18n/messages.test.ts` — 8/8 pass.
- `next build` — clean.
- Full suite left to CI (not run on this box — past OOM).

### Real-browser check

The branch is not deployed (it is not merged, and merging is the owner's call), so the
check was run against the **production build of this branch**, served by `next start`
against the live production database and driven with a real browser — not curl, since
the locale switch is client-side.

Homepage, «چرا آهن‌تایم» section, live values straight from the DB:
**۲۴۳ priced products · ۴۹ mills · ۲۱ industrial clients · ۴ tools · ۴ services** — the
client count matches the logos the `Partners` strip actually renders, one for one.
Layout is the 3-column grid at 1440px, RTL, arrows mirrored, cobalt icon tint.

Switching language via `LocaleSwitcher` was verified for all three non-default locales:

| Locale | Cookie | `<html>` | Result |
|---|---|---|---|
| `en` | `ahantime_locale=en` | `lang=en dir=ltr` | Hero, «how», «why», partners, browse and compare all English; digits Latin (`243`, `49`, `21`, `4`, `4`). |
| `ar` | `ahantime_locale=ar` | `lang=ar dir=rtl` | All sections MSA; no Persian-only letters anywhere in the section. |
| `zh` | `ahantime_locale=zh` | `lang=zh dir=ltr` | All sections simplified Chinese. |

`/about` under a switched locale renders the full body translated — hero, both prose
blocks, all 8 advantage cards, the how-buying-works paragraph and the contact card —
with the phone numbers in Latin digits. Route metadata stays Persian, as designed.

The only console errors were this harness's own RSC prefetch failures
(`NEXT_PUBLIC_SITE_URL` points at https while the harness serves http); none on `/about`.

One more Persian string surfaces on the price surfaces in every locale: «تماس بگیرید»,
the `priceHiddenLabel` shown in place of a stale or absent price. Left as-is for the
same reason as `PriceBoard` — it belongs to the catalog data surface, not to static
marketing copy.

---

<a id="agent-report-seo-keyword-tools"></a>

## Source: `AGENT_REPORT_seo_keyword_tools.md`

# US-14.4 — SEO checklist, keyword-research shortcuts, Search Console

Branch `feat-seo-keyword-tools` · **Draft PR: https://github.com/Am1eza/Iron/pull/69**
Four commits on top of `71b6274`. Nothing merged, nothing deployed.

---

## 1. What was implemented

### 1.1 In-editor SEO checklist — complete

`web/src/lib/seo/onPageAudit.ts` (the logic) + `web/src/components/admin/content/seo/SeoChecklist.tsx`
(the rendering). A green/amber/red panel in the article drawer's side column,
recomputed on every keystroke.

Twelve checks, all keyed off the new `focusKeyword` field: focus keyword set ·
title length · meta-description length · keyword in title / in the URL slug /
in the first paragraph / in at least one H2–H3 · keyword density · paragraph
length · Persian passive voice · link count (internal vs external) · image
alt-text coverage. Each returns a status **and** a Persian sentence saying what
to do about it.

**No dependency, and deliberately not `yoastseo`** — that package is GPL-3.0 and
this is a closed commercial codebase, so importing or vendoring it would put the
whole app under a copyleft obligation. The logic is written from scratch, with
no import beyond the app's own `normalizePersian`.

It is Persian-first, which is the other reason an off-the-shelf English
analyser was never going to fit:

- Keyword tests tokenise **both sides** and compare token *sequences*. A
  substring search reports «آهن» as found inside «آهنگ» and hands the writer a
  green light they did not earn.
- **ZWNJ is word-internal, not a word break** — see §3.1; this was the blocker.
- Hamza carriers (أ/إ/آ/ؤ/ئ) and all **three** digit sets are folded, so
  «تأمین» matches «تامین» and «ورق ۲ میل» matches «ورق 2 میل». On a steel site
  the size *is* the keyword.
- The passive detector covers both shapes Persian actually uses (past
  participle + شدن, and verbal-noun + شدن), the negated forms («ثبت نشده است»),
  and the ZWNJ spelling. It is a heuristic and the UI says «احتمالاً».

Accessibility: every row's status is carried three ways at once — colour, a
distinct glyph (✓ ! ✕ –), and a visually-hidden Persian word. There is
deliberately no `aria-live` region: announcing twelve results while someone is
mid-sentence would make the editor unusable with a screen reader on.

### 1.2 keywordchi / Google Trends deep links — complete

`web/src/lib/seo/keywordTools.ts` + `KeywordToolLinks.tsx`. Two anchors under
the focus-keyword input.

**Neither site has a usable public API, confirmed rather than assumed.**
keywordchi advertises `api.keywordchi.com`, which is their internal backend and
answers 403 to anyone outside their app; their search is a
`POST /SearchMng/Search` guarded by an ASP.NET anti-forgery token, so it cannot
be deep-linked either. What *can* be linked is `keywordchi.com/<keyword>`, which
loads with the search box **pre-filled** — verified against the live site (the
input renders `value="قیمت ورق گالوانیزه"`). Google Trends'
`/trends/explore?q=…&geo=IR&hl=fa` is a real, stable deep link.

So the UI is two "open in a new tab" buttons and claims nothing more. No
"connected ✓" chrome, no cached numbers, no background fetch.

### 1.3 Google Search Console — infrastructure complete, connection OFF

| File | Role |
|---|---|
| `integrations/searchConsoleConfig.ts` | env reading + the single `isSearchConsoleConfigured()` predicate |
| `integrations/searchConsole.ts` | OAuth2 (auth URL / code exchange / refresh / revoke) + one Search Analytics call |
| `repos/searchConsoleRepo.ts` | the grant row and the per-path metrics cache |
| `services/searchConsole.service.ts` | orchestration, reporting window, page-URL derivation |
| `jobs/searchConsoleRefresh.job.ts` | daily refresh, registered in `jobs/index.ts` |
| `api/admin/seo/search-console/{,connect,callback,metrics}/route.ts` | four routes |
| `components/admin/content/seo/ArticleSearchConsole.tsx` | the per-article panel |
| `components/admin/dashboard/SearchConsoleConnection.tsx` | connect/disconnect on `/admin/seo` |

Migrations `0030_search_console_metrics` and `0031_search_console_auth`, both
additive `CREATE TABLE`, nothing destructive.

The job pattern mirrors `marketPoll.job.ts`: a plain `Job` in the `jobs` array,
run under `runExclusive`'s per-name pg advisory lock, safe to interrupt (each
path's cache is replaced in its own transaction). Daily rather than hourly
because Search Console's own data only settles after 2–3 days. It is **not**
added to `cronRunner.ts` (the Cloudflare Workers target), which already omits
`smsAutomationJob`/`weeklyReportJob` and has no daily trigger bucket —
consistent with existing practice, not an oversight.

**With `GSC_*` unset — the state it ships in — every entry point returns a clear
"not configured", the job costs one function call a day, and no Search Console
UI renders anywhere.** Nothing fabricates a number.

---

## 2. Network: **direct access works — no relay needed**

This was measured, twice, not assumed:

| Endpoint | From the host | From inside `ahantime-web-1` |
|---|---|---|
| `accounts.google.com/o/oauth2/v2/auth` | 302, 0.41s | — |
| `oauth2.googleapis.com/token` | 404 (GET on a POST endpoint = it answered), 0.38s | 404, 638ms |
| `searchconsole.googleapis.com/$discovery` | **200**, 0.60s | **200**, 532ms |
| `www.googleapis.com/webmasters/v3/sites` | 403 ("authenticate first" = it answered), 1.12s | 403, 539ms |

No proxy variables are set on the host, so this is genuinely direct.
**A relay is not required and none is deployed.**

Three overrides exist anyway — `GSC_AUTH_BASE_URL`, `GSC_TOKEN_BASE_URL`,
`GSC_API_BASE_URL` — with exactly the shape of `AI_BASE_URL` in
`aiRelayConfig.ts`. If Google is ever filtered, pointing them at an out-of-Iran
proxy is an `.env` edit, not a code change. They are read independently because
the three hosts are different services and a relay might only need to cover one.

---

## 3. What the four review passes found, and what was fixed

Four independent reviewers ran in parallel: (a) SEO scoring logic + Persian
edge cases, (b) DB/migration/API, (c) UI/a11y/RTL, (d) security. **Every real
finding below was fixed and is covered by a test.**

### 3.1 BLOCKER — ZWNJ broke keyword matching for correct articles

The first version folded ZWNJ (نیم‌فاصله) to a **space**, so `«قیمت‌آهن»` would
tokenise like `«قیمت آهن»`. That bought one rare compound case and paid for it
with **every Persian enclitic**: `«ورق‌های گالوانیزه»` became
`[ورق][های][گالوانیزه]`, and the keyword `«ورق گالوانیزه»` — which requires
adjacency — matched *nothing*. Reproduced: an article using the phrase 30 times
scored `keywordDensity: bad, «کلیدواژه اصلاً در متن نیامده است»`. Five checks
went red simultaneously on a correct article.

**Fixed** by making ZWNJ word-internal, adding a light enclitic stemmer
(ها/های/هایی/تر/ترین/مان/تان/شان/ام/ات/اش, with a three-letter stem floor so
«دفتر» cannot become «دف»), and recovering the compound case in `countSequence`,
which now joins in **both** directions. It also fixed a 10–20 % inflation of the
displayed word count.

### 3.2 BLOCKER — the focus keyword was silently discarded on article CREATE

`createPayload` had no `seo` key, so zod stripped it; the post-create reseed
then overwrote the drawer's inputs with the server's empty ones. Because
`initial` was recomputed from the same object, `dirty` went false — **no unsaved
warning, a success toast, and the keyword simply gone.** This also silently
affected the pre-existing `seoTitle`/`seoDescription`/`ogImage`/`canonical`
fields.

**Fixed**: `articleSeoSchema` is now shared by both article routes,
`createArticle` accepts and persists `seo`, and the drawer sends it on create.

### 3.3 BLOCKER — the feature could never have been switched on

`GSC_*` were absent from `docker-compose.yml`'s `environment:` block and from
`.env.example`. The owner would have set them in `.env`, restarted, and
`isSearchConsoleConfigured()` would still be false with no diagnostic anywhere.
**Fixed**: all seven variables wired through compose, and documented in
`.env.example` with the exact Google Cloud steps.

### 3.4 BLOCKER (security) — path validation was bypassable

The `path` parameter was checked with a list of prohibitions. The WHATWG URL
parser treats a **backslash** as a slash for special schemes, so `/\evil.com`
passed every one of them and `new URL(path, SITE_URL)` resolved to
`https://evil.com/`. Not exploitable today (the value only becomes a filter
expression inside a request whose host is fixed), but the stated invariant was
false and the next person to `fetch()` it would have inherited an SSRF.

**Fixed**: `sitePathSchema` proves the property by construction — resolve, then
require same-origin, path-only, and a byte-identical round trip. Nine test cases
pin it, including the two backslash forms.

### 3.5 Other real findings, all fixed

| # | Finding | Fix |
|---|---|---|
| 1 | `RETURNING` on an UPDATE yields **post**-update values, so `consumeOAuthState` read back the timestamp it had just nulled — the legitimate callback was rejected every time (caught by a new test, not by eye) | TTL moved into the `WHERE` clause; one atomic conditional UPDATE |
| 2 | `consumeOAuthState` cleared the nonce **before** comparing, so a stray callback killed a consent still in progress | conditional UPDATE; a wrong nonce now changes nothing |
| 3 | Postgres refuses an `ON CONFLICT DO UPDATE` whose own `VALUES` list hits a key twice — a duplicate query in one response aborted the whole transaction | dedupe by query before insert, last writer wins |
| 4 | HTTP 400 treated as a broken grant regardless of endpoint — one malformed Search Analytics query aborted the entire daily run and told the owner to redo a working OAuth flow | `isGrantFailure` is endpoint-aware; 400 counts only from the token endpoint |
| 5 | `absolutePageUrl` used `NEXT_PUBLIC_SITE_URL`, so a `www`/apex mismatch against the verified property matched **zero rows on every page** while still recording success — indistinguishable from a site nobody has found | builds against `GSC_SITE_URL` when it is a URL-prefix property |
| 6 | Reporting window was 29 days under a constant that says 28 (Google's dates are inclusive), and was recomputed per path so a run crossing midnight left mixed periods | `WINDOW_DAYS - 1`; one window per run, passed down |
| 7 | An open circuit breaker still did N error reports and N DB writes, one per remaining article | `CircuitOpenError` breaks the loop |
| 8 | Density weighted by phrase length but graded against occurrence-density thresholds — 8 mentions of a 3-word phrase in 600 words was called keyword stuffing | occurrence-based density (the Yoast definition) |
| 9 | Density graded unrounded but displayed rounded: the panel showed «۰٫۳٪» and called it below the 0.3 % floor | grade the number shown |
| 10 | One link split across text nodes (a bold word inside a link) counted as three | consecutive same-href nodes collapse to one |
| 11 | Headings, captions and table cells counted as "sentences", so a data-heavy article diluted its passive ratio to a green light | passive scan runs on prose paragraphs only |
| 12 | «متن مقاله خالی است» on an article full of headings and tables | keys off word count, not paragraph count |
| 13 | `«نوشته‌شده است»` — the typographically *correct* passive spelling — was the one spelling the detector could not see; negated passives were entirely invisible | ZWNJ→space for the grammar scan; negated auxiliaries added |
| 14 | Three full tokenisation passes per keystroke (~50 ms on a 100 kB article) | one pass, reused by every check |
| 15 | Green dot: `--color-gain` under white is **3.30:1**, failing AA — and those are the "DATA ONLY" primitives the token file reserves for market movement | Alert's vetted tint/ink pairs |
| 16 | `Badge tone="stale"` maps to the same red as `loss`, so "nothing to check yet" rendered as a failure; `tone="warning"` ink is not redefined for dark mode (~3.4:1 there) | self-styled pill using Alert's pairs; `neutral`/`success` for the connection badges |
| 17 | Two mutually exclusive toggle buttons — clicking one unmounted it, dropping keyboard focus to `<body>` | one button whose label swaps |
| 18 | The refresh `<Button>` was handed a muted-caption class, so an action rendered as grey text (and which rule won depended on stylesheet order) | positioning wrapper instead |
| 19 | `status.lastError` was signalled by colour alone | glyph + visually-hidden «خطا» |
| 20 | The connection panel vanished entirely if its status call failed — the exact outcome it exists to prevent | explicit error state with a retry |
| 21 | The OAuth outcome toast re-fired on every remount/back-navigation | `router.replace` strips the param |
| 22 | A `<div>` nested inside a `<span>`; server-error key `seo.focusKeyword` never cleared | both fixed |
| 23 | `«   »` stored as `focusKeyword: ''` — a field that looks filled but grades as unchecked | trim before the empty test |
| 24 | 409 returned for a Google outage; missing `no-store` on two responses; rate limit ran after body parsing | 502 for upstream, headers added, limiter moved first |
| 25 | `connectedEmail` was a column, a DTO field and a rendered line that nothing ever populated | removed end to end; 0031 regenerated |
| 26 | Zero tests for ~900 lines of new server code | 98 new tests (see below) |

### 3.6 Accepted, not fixed — and why

- **The refresh token is stored in plaintext.** Unlike `refreshTokens.tokenHash`
  (sha256 + pepper) it must be *replayed* to Google, so it cannot be hashed.
  The consequence is real and now stated in the schema comment and in the PR:
  from migration 0031 on, restic snapshots and any `pg_dump` contain a live
  Google credential. It is read-only (`webmasters.readonly`) and revocable both
  from the owner's Google account and from «قطع اتصال». Encrypting it at rest
  with an env key is a reasonable follow-up; it was not done here because a
  missing key would become a new silent failure mode on a feature that is
  already off.
- **The OAuth nonce is global** (one `id='default'` row), not per-session, so
  two admins connecting concurrently clobber each other's state. UX only, on a
  once-a-year action, by a single owner.
- **`POST /connect` is not rate-limited.** It costs one DB upsert and requires
  `settings:write`.
- **The passive detector's known misses** are documented in the code: it will
  flag `«این کالا آماده ارسال شد»` and will not catch verbal nouns outside its
  bounded list. It is a writing hint, not a parser, and the UI hedges.
- **`clicks`/`impressions` are `real`** where Google returns integers. Exact
  below 2²⁴; irrelevant at this site's volume.

---

## 4. Verification — all in Docker, all green

| Gate | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | **clean** |
| Lint | `next lint` | **no errors**; only pre-existing warnings in unrelated files (`ProductImage`, `Marquee`, `AuditLog`, …), none in new code |
| Styles | `stylelint 'src/**/*.css'` | **clean** (tokens-only + logical properties enforced) |
| Unit/component | `vitest run` | **1189 passed / 108 files**, 0 failed |
| Build | `next build` (`NODE_ENV=production`) | **exit 0**; all four `/api/admin/seo/search-console/*` routes emitted |

**98 new tests** across five files:

- `lib/seo/onPageAudit.test.ts` (72) — tokenisation, enclitics, hamza, three
  digit sets, both ZWNJ directions, every length-band **boundary** (39/40,
  49/50, 60/61, 70/71 and the description equivalents), density calibration,
  passive voice including negation and ZWNJ spellings, duplicate links,
  table-only bodies.
- `lib/server/repos/searchConsole.pg.test.ts` (15, real Postgres) — cache
  replacement semantics, duplicate-key survival, pruning, nonce single-use /
  wrong-nonce / expiry, and that a refresh never clobbers the refresh token.
- `lib/validation/sitePath.test.ts` (7) — every bypass the security review
  found, including both backslash forms.
- `lib/server/services/searchConsole.window.test.ts` (7) — window inclusivity,
  UTC formatting, property-vs-site-origin page URLs.
- `lib/seo/keywordTools.test.ts` (6) — path vs query encoding.

Two of these tests found real bugs while being written (§3.5 rows 1 and 3).

---

## 5. Exact next steps for the owner

Sections 1 and 2 are live the moment this merges. Section 3 needs six steps:

1. In **Google Cloud**, create (or pick) a project and enable the
   **Search Console API**.
2. Create an **OAuth 2.0 Client ID**, type **Web application**.
3. Under *Authorized redirect URIs* add **exactly**:
   `https://panel.ahantime.com/api/admin/seo/search-console/callback`
4. In `/opt/ahantime/.env` set:
   - `GSC_CLIENT_ID=…`
   - `GSC_CLIENT_SECRET=…`
   - `GSC_SITE_URL=` — the property **exactly** as Search Console spells it:
     `sc-domain:ahantime.com` for a Domain property, or `https://ahantime.com/`
     **with** the trailing slash for a URL-prefix one. Google matches this
     string literally; a mismatch returns rows for nothing and looks like a
     permissions error.
5. `docker compose up -d web`
6. Open `/admin/seo` and click «اتصال به سرچ کنسول» (needs `settings:write`;
   a content editor sees the panel but not the button). Consent once with the
   Google account that owns the property.

Data appears within a day (the job runs daily), or immediately via
«به‌روزرسانی» on a published article. Expect nothing for the first 2–3 days on
a newly published page — that is Search Console's own reporting lag.

**No relay setup is needed.** Leave `GSC_AUTH_BASE_URL` / `GSC_TOKEN_BASE_URL` /
`GSC_API_BASE_URL` unset unless Google becomes unreachable from the server; the
measurements in §2 say it is reachable today.

The scope requested is `webmasters.readonly` — this code never writes to Search
Console.

---

## 6. Deliberately not done

- **Not merged, not deployed.** The Search Console half is incomplete pending
  credentials only the owner can create, so it lands as a review-first draft.
- No auto-deploy was triggered; `.env` was not read or modified.

---

<a id="agent-report-upload-retry"></a>

## Source: `AGENT_REPORT_upload_retry.md`

# AGENT_REPORT — retry-with-backoff for the admin image upload

**Branch:** `worktree-upload-retry` · **Scope:** `web/src/lib/api/{http.ts,config.ts,http.test.ts}`

## Why

`httpUpload()` had zero retry. One dropped connection and the admin saw
«خطای برقراری ارتباط با سرور» immediately. The panel is used Iran-to-Iran over a
domestic link that blips; 48h of server logs show zero upload attempts reaching us
for the reported failures, i.e. the request dies before Caddy. Payloads are already
compressed client-side to WebP / 1920px / q0.82, so the realistic failure is a blip,
not a slow transfer — exactly the case a retry fixes.

## What changed

- `config.ts`: new `UPLOAD_RETRIES = 2` (3 attempts total), matching `DEFAULT_GET_RETRIES`.
- `http.ts`: `httpUpload()` restructured into a `for(;;)` loop, same shape as `httpRequest()`,
  reusing the existing `backoff()` helper (400ms, then 800ms — ~1.2s of added wait in the
  worst case).
  - `doUpload()` no longer swallows the fetch rejection; it just rethrows. It already built
    its own `AbortController` + timer per call, so calling it again gives each attempt a
    **fresh 60s timeout** with no restructuring needed. The `finally { clearTimeout }` stays.
  - The `ApiError(0, 'ارتباط با سرور برقرار نشد…')` throw moved to the exhausted-retries
    branch. Message and status are **unchanged** — this reduces how often it appears, not
    what it says.
  - **Total wall-clock budget:** a retry only happens while
    `Date.now() - startedAt < UPLOAD_TIMEOUT_MS`. So a blip that fails in 2s retries; a
    request that burned the whole 60s timeout is *not* retried into a 3-minute freeze — it
    fails exactly as it does today. This is what makes 2 retries safe for a user-facing path.
  - The 401 recovery hook stays a separate, exactly-once retry, now guarded by `authRetried`
    (the loop needs the guard the old straight-line code got for free). It neither consumes
    nor is consumed by the network retry budget.

## Retry only on raw fetch failure — how that's verified

Retry lives in the `catch` around `await doUpload()`, which only fires when `fetch()` itself
rejects. Any `Response` — 4xx or 5xx — leaves that catch behind and falls through to
`if (!res.ok) throw await toApiError(res)` on the first pass. Tests pin it:

- `does NOT retry a 4xx …` — a 413 `too_large` throws `ApiError(413, 'حجم فایل زیاد است.')`
  with `fetch` called **exactly once**. A file the server rejected is not re-uploaded 3×.
- `does NOT retry a 5xx either …` — 500, one fetch call.
- `rides out a dropped connection …` — reject-then-200 now **resolves** (previously threw).
- `gives up after UPLOAD_RETRIES …` — `1 + UPLOAD_RETRIES` calls, then the same
  `ApiError(0, …)` message as before.
- `keeps the 401 recovery retry separate …` — network-fail → 401 → 200 succeeds in 3 calls
  with the hook invoked once.

## UX decision: silent retry

Chosen over a «تلاش مجدد…» indicator. All three call sites already show a generic busy state
and each reports failure through its own channel (toast in `RichTextEditor` / `LetterheadForm`,
inline `error` state in `ImageUpload`); a retry signal would have to be threaded through
`adminApi.uploadImage` / `meApi.letterhead.uploadLogo` into three differently-shaped UIs.
The freeze risk that would justify that cost is removed by the total-budget guard above —
worst added wait is ~1.2s of backoff on top of attempts that themselves failed fast. Revisit
if we ever raise the retry count or drop the budget guard.

## Call sites

`httpUpload<T>(path, file)` signature and return type unchanged, so `LetterheadForm.tsx`,
`ImageUpload.tsx` and `RichTextEditor.tsx` are untouched and behave identically — their
`catch (err) { … err instanceof ApiError … }` / `finally { setUploading(false) }` blocks see
the same errors, just less often.

## Verification run

- `vitest run src/lib/api/http.test.ts` → **17 passed** (12 pre-existing + 5 new).
- `tsc --noEmit` → clean.
- `next lint` on the three touched files → no warnings or errors.
- Full suite deliberately left to CI (past OOM on this box).

> Note for anyone repeating this in a fresh worktree: `tsc` reports 3 spurious
> `Cannot find module '…/ahantime-logo.png'` errors until `web/.next` exists. They vanish
> with the main checkout's `.next` linked in, and are unrelated to this change.

---

<a id="agent-report-ux-audit-p0"></a>

## Source: `AGENT_REPORT_ux_audit_p0.md`

# P0 UX audit — fix report

Continuation of a job that started directly on the production VPS and was
moved to a local Mac checkout (`/Users/amirreza/Iron`) after the VPS became
overloaded from too many concurrent agent jobs. Everything below was done
against a locally seeded Postgres DB (`pnpm db:migrate && pnpm db:seed`) and
a local `pnpm dev` server — no production server was touched.

Base commit for every branch: `main@59a0e9e`, except the compare-UX PR which
is stacked on `perf/price-table-single-dom` (#250, per the brief's
instruction to build on the single-DOM table rather than redo it).

## What was fixed

### 1. Fixed-position UI collision + route exclusion — PR #255 (`ux-p0-audit` → `main`)
Finished and verified work that was already in progress on the branch.
- `ArrivalPopup` and `CallbackWidget` («تماس بگیرید» FAB) both used the same
  `inset-block-end` offset — collided on mobile with each other and with the
  toast region. Split into three stacked "floating lanes" in `tokens.css`.
- `ArrivalPopup` now suppresses itself by route (`arrivalPopupRoutes.ts`:
  `/cart`, `/request`, `/login`, `/account`, `/club`, `/ai`, `/admin`,
  `/panel-login`) and the 12s reveal timer isn't even scheduled there.
- New `useAnyModalOpen()` (derived from the existing `useFocusTrap` hook, so
  it can't drift from what's actually modal) hides the popup while any real
  dialog is open — including the price-compare modal.
- Evidence: `ArrivalPopup.test.tsx` 7/7. Live: mobile viewport (390×844) on
  `/prices/rebar` shows no overlap between popup/FAB/toast; popup does not
  appear on `/login` after 14s; popup hides while the compare modal is open
  and reappears when it closes.

### 2/3/7. Compare-selection feedback, diff highlighting, touch targets — PR #258 (`compare-ux-feedback` → `perf/price-table-single-dom`)
- Selecting exactly one product now shows «حداقل دو محصول برای مقایسه
  انتخاب کنید — یک مورد دیگر را هم علامت بزنید.» (`role="status"`) instead
  of a silently-disabled button.
- The 2–4-product compare modal highlights rows where the selected products'
  values actually differ (size, dimensions, factory/region, weight, price,
  movement, delivery) with a tinted background, and offers a next action —
  «افزودن گزینهٔ ارزان‌تر (نام) به سبد» — when a genuine price difference
  exists among visibly-priced selections.
- Compare checkbox (~13×13px) wrapped in a 44×44px padded tap target without
  changing its visual size; the «پرش سریع به کارخانه» quick-jump chips
  (~30px tall) now have `min-block-size: 44px`.
- ArrivalPopup-over-modal suppression from #255 covers this modal too, once
  both PRs are merged — no extra code needed here.
- **Caveat**: `perf/price-table-single-dom` has a pre-existing SSR/client
  hydration mismatch on `/prices/[category]`, reproduced on a clean checkout
  of that branch before any change of mine. It doesn't block functionality
  but makes live-browser verification unreliable, so this PR's logic is
  verified with `PriceTable.compareUx.test.tsx` (jsdom, no SSR involved)
  rather than the dev server. Flagged in the PR for the owner; not fixed
  here since it's #250's code, not mine.
- Evidence: `PriceTable.compareUx.test.tsx` 5/5 (new) + 139/139 pre-existing
  `src/components/catalog/` tests.

### 4. Login-required warning before checkout redirect — PR #260 (`login-warning-cart` → `main`)
- Cart CTA now reads «ورود و ادامه ثبت درخواست» for a signed-out visitor
  (unchanged for one already authenticated), via `useAuth().isAuthenticated`.
- Login page shows a reassurance alert when arrived via `next=/request`:
  «سبد استعلام شما نگه‌داشته شده؛ پس از تأیید شماره، به ثبت درخواست
  بازمی‌گردید.» New `auth.requestFlowNote` key, translated in all four
  locale catalogues (fa/en/ar/zh), covered by the existing key-parity test.
- Club-popup suppression on `/login` (audit called this out by name) was
  already covered by fix #1's route list — confirmed live, not re-done.
- Evidence: `CartView.test.tsx` (2, new), `LoginForm.test.tsx` (3, new).
  Live: guest → cart → CTA text correct → `/request` → redirected to
  `/login?next=%2Frequest` → reassurance alert rendered.

### 5. kg-priced product cart quantity — PR #262 (`cart-qty-kg-products` → `main`)
- New `KgQuantityModal` (lazy-loaded): defaults to **one شاخه's worth**
  (`theoreticalWeightKg`) when the SKU has a recorded branch weight, with a
  stepper for branch count and a toggle to direct-kg entry; when the SKU has
  no recorded branch weight, direct-kg entry is the only mode and confirm
  stays disabled until a weight is typed (no silent 0 or 1kg default).
- Wired into both add-to-cart entry points: `PriceTable`'s per-row button
  and `SkuDetail`'s CTA. Non-kg bases (شاخه/برگ/عدد/…) verified unchanged —
  `qty: 1` there already means one real unit.
- Evidence: `KgQuantityModal.test.tsx` (4), `PriceTable.kgQuantity.test.tsx`
  (3), `SkuDetail.kgQuantity.test.tsx` (3) — all new, 149/149 across
  `src/components/catalog/` + `src/components/cart/`. Live: SKU page for a
  7.4kg-branch rebar product opens the modal defaulting to «۷.۴ کیلوگرم»;
  confirming adds exactly that line to the cart (checked in `/cart`).
- **Note for the owner**: this PR's `PriceTable.tsx` diff targets the
  current (pre-#250) dual desktop/card DOM, same file #250/#258 also touch.
  Small and additive (one new gate + one new component) — should rebase
  cleanly onto #250 either order, but sequencing is worth a look when
  merging all of these.

### 6. Factory-comparison tool context — **skipped, already fixed**
Verified PR #245 (`fix/price-basis-accuracy`, sibling `audit-price-accuracy`
job) already seeds `BulkQuote`'s `defaultSub`/`defaultSize` from the SKU
page's own row (`SkuDetail.tsx` → `<BulkQuote defaultSub={row.subCategoryId}
defaultSize={row.size} .../>`), with a regression test showing 193/193 rows
correctly scoped to the SKU's own sub-category. No duplicate work done.

### 8. 404 page icon + real search — PR #264 (`fix-404-page` → `main`)
- New `SearchOffIcon` (magnifying glass + × in the lens) replaces the
  default `EmptyState` glyph (`IBeamGlyph`, a steel I-beam that reads as a
  capital "I"/cursor out of catalog context) **on this page only** — the
  shared default is untouched everywhere else it's used.
- Reused the existing `SearchBar` component (`size="lg"`, autoFocus),
  wired to the real `/search?q=` route, under the empty-state block.
- Evidence: `not-found.test.tsx` (3, new). Live: bad URL → HTTP 404, new
  icon renders, typed «میلگرد» + submit → navigated to `/search?q=میلگرد`.

## Hero video pause control — out of scope, as instructed
Left untouched per the owner's explicit exclusion (see `HeroVideo.tsx`'s
own comment: a prior reduced-motion attempt caused a flash bug and was
reverted 2026-08-14).

## What I could not fully verify
- **PR #258's compare-modal visuals** — see the hydration-mismatch caveat
  above. Logic is verified by test, not by trusting the live dev server on
  that branch.
- **CI status at hand-off**: `Workers Builds: ahantime` is red on every PR —
  confirmed pre-existing/independent of any of these changes per
  `CLAUDE.md`. `checks` fails on PRs based on plain `main` with the exact
  `scripts/repairSeedPrices.ts` typecheck error tracked by the still-open
  PR #249 — not caused by this work. PR #258 (based on #250) additionally
  saw one e2e failure in `e2e/auth.spec.ts` (OTP flow, a file none of this
  work touches) and PR #262 saw one unit-test failure in
  `src/lib/auth/service.test.ts` (also untouched) — both read as flakes
  given the number of PRs/CI runs firing concurrently around the same
  commit; not chased down further, see `UX_P0_AUDIT_FINAL_SUMMARY.md` for
  exact run links.

## Choices left for the owner's judgment
- Exact Persian copy wording throughout (hint text, CTA labels, alert copy)
  — written to match the site's existing tone, but is exactly the kind of
  thing a native-speaking human reviewer should sign off on.
- PR merge order/sequencing given the `PriceTable.tsx` overlap between
  #250 (perf), #258 (compare-UX, stacked on #250) and #262 (kg-quantity,
  based on plain `main`).
- The `perf/price-table-single-dom` hydration bug (#250) — flagged, not
  fixed, since it's a sibling PR's own code.

---

<a id="ux-p0-audit-final-summary"></a>

## Source: `UX_P0_AUDIT_FINAL_SUMMARY.md`

# UX P0 audit — final summary

Continuation of a job that was originally running on the production VPS and
got moved here (`/Users/amirreza/Iron`, a local Mac checkout) after the VPS
was overloaded by too many concurrent jobs. Everything below was built and
verified against a local Postgres (`pnpm db:migrate && pnpm db:seed`) and a
local `pnpm dev` server. No production server was touched. Full narrative
detail (evidence, live-verification steps, what got skipped and why) is in
`AGENT_REPORT_ux_audit_p0.md`, committed to the `ux-p0-audit` branch.

## PRs opened

All open, none merged, all pushed to `Am1eza/Iron`.

| PR | Branch → base | Covers | CI (`checks` / `e2e`) |
|---|---|---|---|
| [#255](https://github.com/Am1eza/Iron/pull/255) | `ux-p0-audit` → `main` | #1 — popup/FAB collision + route exclusion | ✅ pass / ❌ fail (unrelated, see below) |
| [#258](https://github.com/Am1eza/Iron/pull/258) | `compare-ux-feedback` → `perf/price-table-single-dom` (#250) | #2, #3, #7 — compare-selection hint, diff highlighting + next action, touch targets | ❌ fail (unrelated) / ❌ fail (unrelated) |
| [#260](https://github.com/Am1eza/Iron/pull/260) | `login-warning-cart` → `main` | #4 — login-required warning before checkout redirect | ✅ pass / ✅ pass |
| [#262](https://github.com/Am1eza/Iron/pull/262) | `cart-qty-kg-products` → `main` | #5 — kg-basis product cart quantity step | ❌ fail (unrelated) / ✅ pass |
| [#264](https://github.com/Am1eza/Iron/pull/264) | `fix-404-page` → `main` | #8 — 404 page icon + real search | ✅ pass / ✅ pass |

`Workers Builds: ahantime` is red on **every** PR — per `CLAUDE.md`, this is
the secondary Cloudflare Workers target and is known-red on `main`
independently of any PR; not investigated further.

## Item #6 (factory-comparison tool context) — skipped, already fixed
Sibling job `audit-price-accuracy`'s PR #245 (`fix/price-basis-accuracy`,
still open) already seeds `BulkQuote`'s `defaultSub`/`defaultSize` from the
SKU page's own product, with a passing regression test (193/193 rows
correctly scoped). Verified by reading that PR's diff before starting; no
duplicate work done.

## CI failures observed — investigated, none caused by this work

I chased down every non-green check rather than assume it's a flake:

- **`checks` on PRs based on plain `main`** (#255 initially, #262):
  `scripts/repairSeedPrices.ts(178,3): Property 'grade' is missing` —
  exact pre-existing typecheck error, tracked by the still-open PR #249.
  Reproduced on a clean `main` checkout with zero changes of mine. #255's
  `checks` later turned green on its own after a re-run (main likely moved
  in the meantime); #262 still shows this as of hand-off.
- **`checks` on #258** (based on #250): same typecheck error, inherited
  from that branch's own base.
- **One real regression I introduced and fixed**: `checks` on #255 also
  failed a `SiteChrome.test.tsx` assertion — the fix moved `/ai`
  route-exclusion for the club promo from `SiteChrome` into `ArrivalPopup`
  itself, and this pre-existing test still asserted the old contract
  against a route-blind mock. Updated the test to match the new,
  intentional architecture (commit `1dae149` on `ux-p0-audit`); confirmed
  green afterward.
- **`e2e/auth.spec.ts` (OTP registration flow) failing on #255 and #258**:
  identical failure — a 120s timeout waiting for the «نام» textbox during
  registration — on two PRs with non-overlapping diffs (mobile popup CSS vs.
  a price-compare table), neither of which touches auth or registration.
  Reproduces at the exact same line both times. Read as a currently-flaky
  or environment-sensitive e2e test, not something either PR caused.
  Not fixed — out of scope for a UX-audit pass, and not reproducible from
  either diff.
- **`src/lib/auth/service.test.ts` unit test failing on #262**: a refresh-
  token rotation test, in a file this PR never touches (`KgQuantityModal`/
  `PriceTable`/`SkuDetail`). Also reproduces locally on a plain checkout of
  `main` with zero changes — a pre-existing flake, not this PR's.
- **Locally-only noise, confirmed absent from all real CI runs**: running
  the full `vitest` suite on this Mac (Node v26.6.0) fails ~6 unrelated
  files (`AdvisorChat.*.test.tsx`, `persistMigration.test.ts`) with
  `TypeError: Cannot read properties of undefined (reading 'clear')` on
  `localStorage.clear()` — reproduces on a completely clean `main` checkout
  with zero changes, in files none of this work touches. Almost certainly a
  Node 26 experimental-`localStorage` incompatibility with this machine's
  toolchain, since CI's own Node/Docker setup didn't hit it. Two
  Postgres-backed repo tests (`aiReviewPagination.test.ts`,
  `ordersRepo.test.ts`) also failed only when run as part of the full local
  suite and passed cleanly in isolation — read as local parallel-worker
  contention against my single shared local dev DB, not a real bug.
  None of this appeared in the actual GitHub Actions runs linked above.

## Choices left for the owner
- Exact Persian copy wording (hint text, CTA labels, alert copy, icon
  choice) — matched to the site's existing tone, but worth a native-speaker
  sign-off.
- Merge order/sequencing: #258 depends on #250 landing first (or being
  merged into it); #262 touches the *pre*-#250 `PriceTable.tsx` and should
  rebase cleanly onto #250 in either merge order, but it's worth a look
  given three PRs (#250, #258, #262) all touch that one file.
- The `perf/price-table-single-dom` (#250) hydration bug flagged in #258 —
  not fixed here since it's that PR's own code, not this work's.
- The two CI failures traced above to `e2e/auth.spec.ts` and
  `src/lib/auth/service.test.ts` are worth a separate look independent of
  this audit — they reproduce consistently but aren't caused by anything
  in this pass.
