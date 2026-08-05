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
