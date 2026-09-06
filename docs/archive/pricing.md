# Historical reports — pricing

These are historical snapshots, consolidated on 2026-09-06. Deployment, test, price and open-item claims apply to their original reporting context, not the current system. Original report bodies and decisions are retained; verify operational commands against the current runbooks before use.

[Documentation index](../README.md)

## Reports
- [AGENT_REPORT_audit_price_accuracy.md](#agent-report-audit-price-accuracy)
- [AGENT_REPORT_billet_automation.md](#agent-report-billet-automation)
- [AGENT_REPORT_multi_source_price_sync.md](#agent-report-multi-source-price-sync)
- [AGENT_REPORT_price_coverage_gap.md](#agent-report-price-coverage-gap)
- [AGENT_REPORT_price_sync_100pct.md](#agent-report-price-sync-100pct)
- [AGENT_REPORT_price_sync_system.md](#agent-report-price-sync-system)
- [AGENT_REPORT_volume_discount_tiers.md](#agent-report-volume-discount-tiers)
- [audit-pricing-FINAL.md](#audit-pricing-final)

---

<a id="agent-report-audit-price-accuracy"></a>

## Source: `AGENT_REPORT_audit_price_accuracy.md`

# AGENT_REPORT — price-accuracy, schema-correctness & deploy-safety audit

**Date:** 2026-08-23 (Tehran: 2026-08-24)
**Scope:** the six findings from the external technical/SEO audit
**Outcome:** all six fixed, plus one unrelated blocker found and fixed on `main`.
Six PRs, none merged.

Every claim below is backed by a command run against the live production DB, or by
rendering the patched app against production data. Nothing here is inferred from the
code alone.

---

## PRs

| PR | Title | Base | Audit items |
|---|---|---|---|
| [#245](https://github.com/Am1eza/Iron/pull/245) | stop asserting a per-kg price for products that are not priced per kg | `main` | **P0-1**, **P0-2** |
| [#246](https://github.com/Am1eza/Iron/pull/246) | gate production deploys on CI passing for the same commit | `main` | **P0-3** |
| [#247](https://github.com/Am1eza/Iron/pull/247) | stop asserting stock we do not track and freshness we cannot honour | `#245` | **P1-4**, **P1-5** |
| [#248](https://github.com/Am1eza/Iron/pull/248) | only promise an instant proforma where one is actually issued | `main` | **P1-6** |
| [#249](https://github.com/Am1eza/Iron/pull/249) | load `skus.grade` in `repairSeedPrices` so main typechecks again | `main` | — (blocker, see below) |
| [#252](https://github.com/Am1eza/Iron/pull/252) | this report | `main` | — (docs) |

#247 is stacked on #245 because both touch `productJsonLd`. **Merge #249 first** — it
unblocks CI everywhere. Then #245, then #247 (its base retargets to `main`
automatically), then #246 and #248 in any order.

---

## How the verification environment was built

Production runs `ghcr.io/am1eza/iron-web:d2088f95…`, matching `origin/main` at the time
work started. To get *live* before/after evidence rather than assertions, the patched
branches were run as a throwaway container on the production Docker network, against
the **real production database**, with env pulled from the running web container:

```bash
docker run -d --name audit-dev --network ahantime_default \
  --env-file <env from ahantime-web-1> -v /opt/ahantime:/opt/ahantime \
  node:20 sh -c "./node_modules/.bin/next dev -p 3100"
```

Read-only: no writes, no migrations, no data changes of any kind were made in this task.
The container and the env file were destroyed afterwards (`docker rm -f audit-dev`,
`shred -u`).

---

## P0-1 — Homepage "priced products" count included hidden-price SKUs

**Confirmed.** `page.tsx` set `skuCount = allRows.length` over `getRows()`, which
left-joins `currentPrices` and does not filter on price visibility.

Live homepage claimed **«۵۹۵ محصول قیمت‌خورده»**. The DB explains that number exactly:

```
price age 0 days : 260   <- actually priced and visible
price age 3 days : 119   |  beyond PRICE_STALE_HIDE_AFTER_DAYS = 2
price age 4 days : 154   |  -> withheld; the page renders «تماس بگیرید»
NO PRICE ROW     :  62
                  ----
                   595   <- matches the live claim exactly
```

So **335 of the 595 (56%) were not priced at all** on the page that counted them.

The two price cohorts are unambiguous — `2026-08-20 (Thu)` and `2026-08-24 (Mon)`, with
`HOLIDAYS = []`. Walking the business-day rule from Aug 20: Fri 21 skipped, Sat 22 = 1,
Sun 23 = 2, Mon 24 = 3 ⇒ `>= 2` ⇒ hidden. The Aug-24 cohort is 0 ⇒ visible.

**Fix:** count rows where `!current.priceHidden` — the same flag every public surface
already withholds on (`catalogRepo.toPriceRow`), so the headline and the tables now agree
by construction. Rows are also de-duplicated by SKU id, since a cross-listed SKU is
returned by both its native and its cross-listed category.

**After (patched app, production data):** **«۲۶۰ محصول قیمت‌خورده»** — matching the
independent DB count exactly.

> `factoryCount` was moved onto the same filtered set: the sentence reads
> «… از N کارخانه», i.e. mills we can currently quote.

---

## P0-2 — Universal per-kg assumption

**Confirmed, and it is a real-money bug.** `PriceBasis` exists precisely because the
per-kg invariant is false. Live count of active SKUs:

```
kg     735
piece   19
coil    15
branch   8
sqm      4
sheet    1     -> 47 active SKUs are NOT per-kilogram
```

### a) `bulkSplit.computeBulkSplit`

Multiplied **every** row by `tonnage × 1000`. On a per-قطعه or per-۱۵-متری-کلاف row that
produces a firm-looking quote with no relationship to the product.

The comment sitting there claimed prices are *"ALREADY per kilogram for every SKU
regardless of `unit`"*. That was true of **`unit`**, and pre-dates the `priceBasis`
column — `leads.service`, `estimate.service` and `tenderEstimate` all already gate on
`priceBasis === 'kg'` before doing mass arithmetic. `bulkSplit` was the one that did not.

**Fix:** the same gate, applied at the one place every comparison surface (the panel, the
AI advisor, the landing teaser) reads through. Excluded rows are **counted**
(`excludedNonKg`), not silently dropped, so the UI states what was left out instead of
implying full coverage. `pickBestGroup` likewise ignores non-kg-only groups, which would
otherwise be auto-selected and open an empty panel.

### b) `productJsonLd` — hard-coded `unitCode: 'KGM'`

**Fix:** follows the basis, and is **omitted** where no honest UN/CEFACT Rec-20 code
exists. Only `KGM` (kg), `H87` (piece) and `MTK` (sqm) are emitted; `branch`, `coil` and
`sheet` publish no `unitCode` at all rather than a nearby-but-wrong one — asserting a
plausible-looking wrong code is the exact bug being fixed.

### c) `generateMetadata` — hard-coded «برای هر کیلوگرم»

**Fix:** uses `priceBasisNoun`, the wording the price tables already use.

Live, on the وال‌پست SKU page:

```
BEFORE  ... تماس بگیرید برای هر کیلوگرم، همراه با نوسان ...
AFTER   ... تماس بگیرید برای هر شاخه،    همراه با نوسان ...
```

### d) The وال‌پست context bug

The SKU page passed `getRows(category)` — the **whole category** — to `BulkQuote`, which
then ran `pickBestGroup` and opened on whichever sub-category the most mills quote. On a
وال‌پست page that is «نبشی».

`subCategoryId` occurrences in the payload of
`/prices/angle-channel/val-post/angle-channel-val-post-20x300-zkhamt-2`:

| | `val-post` | other |
|---|---|---|
| **before** (live prod) | 9 | **33** — nabshi 7, channel-light 6, channel-heavy 6, spot 5, angle-unequal 5, separi 4 |
| **after** (patched) | 10 | 5 — the related-products rail, which is legitimately cross-category |

**Fix:** the page passes its own sub-category rows plus `defaultSub`/`defaultSize`; the
sub-selector is hidden where the panel is locked to one product, so it can't switch to a
selection with no rows behind it.

**And the panel now removes itself here entirely.** `val-post` is `price_basis='branch'`
(8 SKUs), so a tonnage comparison is meaningless for it:

```
«مقایسهٔ کارخانه‌ها» present on the wal-post page:  before 1   after 0
```

**Regression check** on a kg-priced product, `/prices/rebar/deformed/rebar-16-a3-faico`:
panel still renders, and **193/193** `subCategoryId` values are `deformed` — perfectly
scoped.

---

## P0-3 — Deploy did not wait for CI

**Confirmed, and caught in the act tonight.**

`deploy.yml` triggered on `push: branches: [main]`, in parallel with and unrelated to
`ci.yml` (same trigger, no relationship). `deploy`'s only `needs:` is its own `build` job,
which compiles the image but runs no lint, no typecheck, no unit tests and no e2e.

Evidence from tonight's own runs on `main`:

```
CI      main push  32668912485  failure  started 21:53:50
Deploy  main push  32668912517  failure  started 21:53:50   <- same second, independent
```

The deploy for a commit whose CI **failed** started at the same second CI did. It only
failed to reach production because that particular error (a typecheck break, see #249)
*also* breaks `next build`. **A failing unit test, lint error, e2e regression or a11y
violation would not have stopped the image, and would have shipped.**

### The fix (option *b* from the audit)

Trigger is now `workflow_run` on `CI`. Chosen over merging the workflows so
build-once-deploy-many is preserved exactly — image still built once, server still only
pulls a tag, health-gate and auto-rollback untouched. DEPLOY.md's rationale is preserved
and extended, not replaced.

The gate checks three things, not just `conclusion`:

| condition | why |
|---|---|
| `conclusion == 'success'` | CI actually passed |
| `event == 'push'` | CI also runs on `pull_request`; a green PR run must never deploy |
| `head_branch == 'main'` | belt and braces with the `branches:` filter |

**The commit is pinned explicitly.** Under `workflow_run`, `github.sha` is *not* the
commit CI tested — it resolves to the default branch's head at dispatch time.
`github.event.workflow_run.head_sha` is, so that is what gets checked out (with an assert
step that fails loudly on mismatch), what tags the image, and what the server resets to.

The server also previously ran `git reset --hard origin/main`, which could leave it
running an image built from commit A while its compose/Caddyfile/migration files came
from a newer commit B. It now resets to the same validated SHA.

### How I gained confidence it actually gates

Not by reading the YAML.

**1. `actionlint` — exit 0.** This also confirms `github.event.workflow_run.*` is a legal
context under this trigger; actionlint flags those when the trigger can't supply them.

**2. Both `if:` expressions evaluated against a full truth table**, modelling GitHub's
real semantics — `&&` binding tighter than `||`, and the null-coercion rule where an
undefined `github.event.inputs.image_tag` compares **equal to `''`** (which is exactly
why every clause is guarded by an explicit `github.event_name` check; without it,
`workflow_run` would satisfy the dispatch branch and deploy unconditionally):

```
scenario                            build  deploy     want b/d  result
------------------------------------------------------------------------
CI green, push to main               True    True          T/T  PASS
CI RED, push to main                False   False          F/F  PASS   <- the fix
CI cancelled                        False   False          F/F  PASS
CI green but pull_request run       False   False          F/F  PASS
CI green on another branch          False   False          F/F  PASS
manual dispatch, no image_tag        True    True          T/T  PASS
manual dispatch, rollback tag       False    True          F/T  PASS   <- rollback kept
------------------------------------------------------------------------
ALL SCENARIOS PASS
```

**3. What I could NOT test, stated plainly.** `workflow_run` fires from the **default
branch's** copy of the workflow file. It therefore cannot fire from a PR branch, and **no
throwaway-failing-test PR can exercise the new trigger** — a PR can only confirm CI itself
still runs. This is inherent to `workflow_run`, not a gap in effort. The audit suggested
that test; it is not available for this option.

**Verify immediately after merging #246** — the merge commit's own CI run is the first
real exercise of the gate:

```bash
gh run list --workflow=deploy.yml --limit 3   # expect event "workflow_run", AFTER the CI run
gh run list --workflow=ci.yml --limit 3       # same head SHA
docker inspect ahantime-web-1 --format '{{.Config.Image}}'
git rev-parse origin/main
```

**The failure mode is safe by design:** if the trigger misbehaves, deploys *stop* rather
than ship something unverified. Recovery is `workflow_dispatch` or CLAUDE.md §5's manual
recipe, and reverting the single commit restores previous behaviour exactly.

---

## P1-4 — Stale price claimed 7-day freshness

**Confirmed.** `priceValidUntil` was `Date.now() + 7 days`, computed at **render** time,
while the freshness policy withholds a price after 2 business days. Worse: because it was
recomputed on every regeneration, **the window could never actually expire**.

**Fix:** derived from `current_prices.updated_at + SLA`, and **omitted entirely** once
that window has closed. Calendar days are used against a business-day SLA deliberately —
business days always span at least as much real time, so the claim errs *short* and can
never out-claim the policy. A withheld price still publishes no `offers` block at all
(that part already worked, as the audit noted).

## P1-5 — `isActive` conflated with stock

**Confirmed.** `available: row.isActive` → `availability: InStoreOnly`. But `isActive`
only means "published in the catalog" — an unpublished product has no page at all, so this
asserted in-stock for **every** product a crawler could see, carrying zero information.

Verified there is **no stock/inventory column anywhere**: none in the Drizzle schema, and
the live DB returns nothing for `%stock%` / `%avail%` / `%invent%` on `skus` or
`current_prices`. (`orders.ts`'s "inventory" is goods a *customer* has stored in the
warehouse — a different concept.)

**Fix:** removed rather than proxied, per the audit. The `available` parameter is deleted
too, so `isActive` cannot be wired back in by accident. No stock field was invented.

**Live evidence** — `/prices/rebar/deformed/rebar-16-a3-faico`, patched app vs. production
data:

```diff
   "businessFunction": "http://purl.org/goodrelations/v1#Sell",
-  "availability": "https://schema.org/InStoreOnly",
-  "priceValidUntil": "2026-08-30",     // render time + 7d
+  "priceValidUntil": "2026-08-25",     // that price's updated_at + 2-day SLA
```

## P1-6 — Instant-proforma claim didn't hold

**Confirmed.** `leads.service.createLead` auto-issues only when
`allPriced && lines.length > 0` (`leads.service.ts:421`).

An important detail the audit's phrasing understates: **`allPriced` is a whole-cart
property, not per-item.** A single line without a usable total sets it `false` and routes
the **entire** lead to a human (`:380`). So the corrected copy says *"every item priced"*,
**not** *"for priced items"* — a partial proforma is not something the code can produce,
and per-item wording would have been a second inaccurate claim.

Given 260 visible-priced SKUs against 335 withheld/unpriced, this is the common path, not
an edge case.

**Fix:** conditional copy in all four locales (fa/en/ar/zh), covering both
`home.how.step2.text` and `home.why.proforma.*` («پیش‌فاکتور رسمی **آنی**» → «پیش‌فاکتور
رسمی»). Admin-side copy describing an operator issuing a proforma by hand is untouched —
that path really is instant.

Live: the «آنی» title is gone (0 occurrences) and the conditional sentence renders in full.

---

## Unrelated blocker found: `main` is red

While checking CI I found `main` itself failing `pnpm typecheck`:

```
scripts/repairSeedPrices.ts(178,3): error TS2322:
  Property 'grade' is missing in type '{...}' but required in type 'SeedRow'.
```

`SeedRow extends MatchableSku`, which gained a required `grade` when the استیل lines began
mirroring off `skus.grade`; this script's `select()` was never updated. Not merely a type
error — the matcher reads `grade` to tell 304 from 316L, so a row loaded without it cannot
match a stainless source table at all.

Fixed in **#249** as a one-line select addition (not a cast), filed separately because it
blocks CI on every open PR. This is outside the audit's scope; flagging rather than
folding it into the audit PRs.

**#249 is green.** Worth recording how that was established, because the first run looked
worse than it was. With the typecheck break fixed, CI reached the `Unit tests` step for
the first time (the typecheck failure had been short-circuiting before it) and that step
failed on two tests:

- `src/lib/auth/service.test.ts:95` — the auth refresh-grace test, a long-documented flake
- `src/lib/server/repos/aiReviewPagination.test.ts:41` — `expected 6 to be 7`

Both **passed locally in isolation** (`aiReviewPagination` 2/2 green), pointing at the
same pglite-under-parallel-load flakiness already documented for e2e rather than a logic
break — and neither can be caused by adding a column to a script's `select()`. A rerun
confirmed it: **`checks` pass (6m5s), `e2e` pass (4m19s)**. So these were flakes, not a
second break, and nothing further is left open on `main`.

The lesson for whoever reads this next: a red `Unit tests` step on `main` right now is
worth one rerun before it is worth an investigation.

---

## Nothing was fabricated

No price, alloy, availability status or freshness date was invented. Where no honest value
exists the field is **omitted**, not guessed:

- `unitCode` for `branch`/`coil`/`sheet` — no unambiguous UN/CEFACT Rec-20 code
- `availability` — nothing tracks stock
- `priceValidUntil` — omitted once the price is already stale

No data was written. No migration was generated. No `.env` was read into output.

## Left undone

Nothing from the six audit items. Two things a reviewer should know:

1. **The `workflow_run` gate cannot be proven before merge** (see P0-3) — post-merge
   verification commands are given above.
2. **#245/#246/#248 are red on `checks` only because they inherit `main`'s typecheck
   break.** GitHub tests a PR merged into its base, so they stay red until **#249**
   lands; re-run them after it does. Two independent confirmations that the audit
   changes themselves are fine: **#247** (based off #245 rather than `main`) is green on
   both `checks` and `e2e`, and **#249** — the same `main` plus the one-line fix — is
   green on both too.

`Workers Builds: ahantime` is red on all PRs; it is red on `main` independently and is
documented in CLAUDE.md §5 as known-red noise. The `e2e` failure seen once on #246 (a PR
that touches only YAML and Markdown) was the known `auth.spec.ts` OTP flake.

---

<a id="agent-report-billet-automation"></a>

## Source: `AGENT_REPORT_billet_automation.md`

# شمش فولاد (billet) — from admin-entered to automatically polled

**Branch:** `worktree-billet-automation` · **Story:** US-05.x (نبض بازار ticker)

## Why

`billet` was the one ticker key with no feed. It sat at **60,800 تومان/kg from
1405/05/25** while the real market ran **66,750–67,700** — a ~10% error that
stood for a week on a site whose entire positioning is price transparency,
purely because nothing automated tracked it and nobody remembered to type it.
(The live value and the historical `market_points` backfill from 2026-08-16
onward were already corrected by hand before this branch; this is the
make-it-self-sustaining half.)

## The source

`esfahanahan.com` — a real Iranian steel retailer — backs its product-page
price chart with:

```
GET /api/products/variations/prices/{productId}?source={from}&destination={to}
→ {"success":true,"data":[[unixSeconds, priceInRial], ...]}
```

Product **626** is شمش فولاد ۱۵۰×۱۵۰ اصفهان (القایی، 5SP، ۱۲ متری), the same
grade the ticker's billet number has always referred to.

It is **not** a documented/public API — it's the endpoint behind their own chart
widget. No auth, no key, no published rate limit. Both are configurable
(`ESFAHANAHAN_BASE_URL`, `ESFAHANAHAN_BILLET_PRODUCT_ID`) so a change upstream
is an env edit, not a deploy of new code.

**Verified server-side before building on it** (the brief's DNS worry):

| check | result |
|---|---|
| plain `curl` from the host | HTTP 200, real data, ~55 ms |
| `https.get` with plain `getaddrinfo` **inside `ahantime-web-1`** (Alpine/musl) | HTTP 200 in 827 ms — **no musl bug for this host** |
| `dns.resolve4('esfahanahan.com')` inside the container | `185.143.234.238`, `185.143.233.238` |

So the musl `getaddrinfo` failure that bites `gold-api.com` does **not**
reproduce here. The `dns.resolve4` workaround is reused anyway — it costs
nothing, works, and means one code path instead of two for outbound JSON.
To avoid a second copy of it, `fetchJson` + `UpstreamHttpError` +
`isRetryableHttpError` were **moved verbatim** out of `tgju.ts` into
`src/lib/server/utils/httpJson.ts`; both integrations now import it. `tgju.ts`
is otherwise untouched and its 8 existing tests still pass unchanged.

Unit: values are **Rial**; stored as **Toman = Rial / 10**, matching every other
Toman key and every billet value ever entered by hand. There is a test asserting
677,000 ﷼ → 67,700 تومان specifically because a missing `/10` here is the
155×-overcharge class of bug — this number feeds auto-quoting downstream.

## Decision 1 — `source` typing: a third value, not reused `'tgju'`

`MARKET_SOURCES` is now `['tgju', 'esfahanahan', 'admin']` (and the matching
`MarketValue['source']` union in `domain.ts`).

**No migration is needed.** `market_values.source` is plain `text` in
`drizzle/0000_init.sql` — no PG enum, no check constraint; the enum lives only
in the Drizzle/TS layer. `drizzle-kit generate` was deliberately not run (the
journal is a known cross-agent collision point and there is no SQL to emit).

Every reader of `source` was checked before deciding:

- `MarketBoard.tsx` renders the **same badge regardless of `source`** (a
  deliberate 2026-08-15 layout decision), so a new value changes nothing visually.
- `flagTgjuStale()` was the only behavioural reader — `UPDATE … WHERE source =
  'tgju'`. **That's exactly why reusing `'tgju'` would have been wrong:** a tgju
  outage would have badged the billet row «با تأخیر» even though esfahanahan was
  fine, and — worse — an esfahanahan outage would have been invisible, leaving
  billet silently stuck again, the precise failure this work exists to end.

So it's generalized to `flagSourceStale(source)`, with `flagTgjuStale()` kept as
a one-line wrapper (`catalog.test.ts` and `alerts.service.ts` comments reference
it). A generic `'auto'` was rejected for the same reason: it would merge the two
feeds' outage domains back together.

## Decision 2 — polling interval: 15 minutes, its own job

`billetPollJob` (`CONSTANTS.BILLET_REFRESH_SECONDS = 900`), registered in
`jobs/index.ts`, offset 20 s from startup so the two feeds don't tick together.

The 60 s `TICKER_REFRESH_SECONDS` cadence exists for FX and gold, which move
minute to minute. Billet is a B2B retailer's published price: a live 7-day
window pulled during this work returned **2 points in 48 hours**. Polling that
every 60 s would be ~1,440 requests/day at an undocumented third-party endpoint
to observe maybe three changes — rude, and a good way to get blocked. 15 min is
~96 requests/day and keeps the ticker within a quarter hour of the source, which
is well inside the **5-minute ISR window** of the pages that quote the billet
reference (`/prices/[category]/[sub]/[sku]`, `revalidate = 300`) — so no extra
`revalidatePath` wiring is needed, and it is four orders of magnitude tighter
than the week of staleness it replaces. Price alerts are likewise already
covered: `alertsJob` evaluates every 60 s independently of which feed wrote.

The request window itself is **7 days wide**, not one day: a quiet weekend or a
holiday leaves gaps, and a wide window makes that read as "unchanged" (we take
the newest point) rather than as an outage. Points are sorted rather than
trusted to be ascending — taking the wrong end would pin the ticker to a
week-old price.

On the secondary Cloudflare Workers target, `cronRunner.ts` only has three fixed
Cron Triggers, so `billetPollJob` rides the 10-minute one. Slightly more often
than Docker; harmless, where every-minute would not be.

## Decision 3 — `PUT /api/admin/market/billet` stays, as a *bounded* override

Kept, not deleted. The owner sometimes has a better number than the feed (a mill
quote off a phone call, or the feed publishing something obviously wrong), and
deleting the route would remove the only way to act on that.

But left naive, the route would be decorative — the next poll would silently
revert it minutes later with no error and no trace. So an admin write now gets a
**hold window**: `refreshBillet()` skips the poll entirely (no upstream request
either) while the row is `source='admin'` and younger than
`BILLET_ADMIN_HOLD_HOURS` (**default 6h**; `0` disables the hold and lets the
feed always win).

Bounded deliberately. "Billet is whatever a human last typed" is the failure
being fixed — after the hold the feed takes back over on its own, so a forgotten
override can go stale by at most 6 hours instead of indefinitely.

## Decision 4 — outage / stale handling

Identical posture to the other four keys (AC-A-2), scoped per feed:

| situation | behaviour |
|---|---|
| esfahanahan unreachable / 5xx / bad shape / empty window | `fetchBilletPrice()` returns `null` (**never throws**), `flagSourceStale('esfahanahan')` → last-known billet value keeps serving with the outage badge |
| esfahanahan down, billet currently on an **admin** override | row is **not** flagged stale — the feed being down says nothing about a hand-entered number |
| tgju down | billet untouched (different source), and vice versa |
| transient 5xx / network error | `withResilience`: 2 retries, 300 ms base backoff; a 4xx (e.g. wrong product id) fails immediately — retrying won't fix it |
| repeated failure | circuit breaker opens after 3 consecutive failures, skipping the network for 30 s |
| timeout | 10 s (a retailer CMS, not a dedicated price API; nothing user-facing waits on it) |

## Files

```
web/src/lib/server/utils/httpJson.ts            NEW  (moved out of tgju.ts)
web/src/lib/server/integrations/esfahanahan.ts  NEW
web/src/lib/server/integrations/esfahanahan.test.ts   NEW  (9 tests)
web/src/lib/server/jobs/billetPoll.job.ts       NEW
web/src/lib/server/services/market.billet.pg.test.ts  NEW  (7 tests)
web/src/lib/server/services/market.service.ts   refreshBillet() + per-source stale flagging
web/src/lib/server/repos/marketRepo.ts          flagSourceStale(); flagTgjuStale() → wrapper
web/src/lib/server/db/schema/market.ts          MARKET_SOURCES += 'esfahanahan'
web/src/lib/types/domain.ts                     MarketValue['source'] union
web/src/lib/config/constants.ts                 BILLET_REFRESH_SECONDS = 900
web/src/lib/server/jobs/index.ts · cronRunner.ts    register billetPollJob
web/src/app/api/admin/market/billet/route.ts    doc: override + hold semantics
web/src/app/api/market/route.ts · components/market/MarketBoard.tsx    stale comments corrected
```

The "Billet is admin-entered and never touched here" comment in
`market.service.ts` is gone, along with the same claim in `schema/market.ts`,
`api/market/route.ts`, `marketPoll.job.ts` and `MarketBoard.tsx`'s two comments.

## Verification run

- `tsc --noEmit` — clean (the 3 `ahantime-logo.png` module errors are
  pre-existing on `main`; they come from build-generated image typings).
- `next lint` on all 11 touched files — clean.
- `next build` — succeeds.
- Targeted vitest: **17 passed** (`esfahanahan.test.ts` 9 + `tgju.test.ts` 8 —
  the moved `fetchJson` breaks nothing), **7 passed**
  (`market.billet.pg.test.ts`), **29 passed** (`catalog.test.ts`,
  `marketRepo.movement.pg.test.ts`, `cleanupMarketPoints.pg.test.ts`).
  The full suite is left to CI (OOM risk on this box).

Integration tests hit **real local HTTP servers** on `127.0.0.1` rather than a
mocked `fetch`, matching `tgju.test.ts` — `fetchJson` uses `node:http(s)` with a
custom DNS `lookup`, so mocking `fetch` would test nothing real.

## After merge — live checks

```bash
curl -sk --resolve ahantime.com:443:127.0.0.1 https://ahantime.com/api/market \
  | python3 -m json.tool | grep -A6 billet          # source: "esfahanahan", isStale: false

docker exec ahantime-db-1 psql -U ahantime -d ahantime -c \
  "select value, at from market_points where key='billet' order by at desc limit 5;"
```

New `market_points` rows should appear with no manual action, at most one per
actual upstream reprice (`upsertMarketValue` skips no-change points by design,
so a flat day correctly adds nothing).

---

<a id="agent-report-multi-source-price-sync"></a>

## Source: `AGENT_REPORT_multi_source_price_sync.md`

# AGENT_REPORT — multi-source price sync (US-05.3)

**Date:** 1405/06/01 · 2026-08-23
**Branches:** `price-sync-source-survey` (docs) · `price-sync-expand-coverage` (code)
**Both left open for review. Neither merged.**

---

## The headline

The brief asked for prices from up to eight more Iranian steel sites to close a
78% coverage gap. **That is not what the gap was.**

ahanonline publishes **352** `/product-category/` pages. The mirror was pointed
at **32** of them — the set the 1405/05/19 comparison audit happened to cover,
inherited by the job and never revisited. Every product line believed to have
"no source" was sitting on an ahanonline page nobody had mapped.

Coverage goes from **251/1,133 (22%)** to **542/1,133 (48%)** by adding twelve
pages and generalising one rule. No new source was added, because the survey
showed no new source was needed — and the most promising candidate would have
closed exactly zero stale SKUs.

## How the gap was actually shaped

The run log was the first real signal, and it contradicted the framing:

```
considered 432 SKUs · wrote 251 · skipped 181
```

432 considered against 1,133 priced means **701 SKUs were never looked at at
all**. They were not failing to match; they were out of scope before matching
began.

## Survey results

Full detail in `docs/price-sync-source-survey.md`. Every number below is from a
live fetch on 1405/06/01, parsed with the production `parseAhanonlinePage` so
the counts are what the job would see — not read off a rendered page and not
taken from a search snippet.

### ahanonline — pages that exist, publish prices, and were unmapped

| Our line | Stale SKUs | Page | Rows |
|---|---:|---|---:|
| تسمه | 93 | `انواع-ورق/تسمه` | 118 |
| کوپلر | 65 | `میلگرد/کوپلر` | 65 |
| ورق استیل | 47 | `انواع-ورق/ورق-استیل` | 188 |
| ورق آلومینیوم | 24 | `انواع-ورق/ورق-آلومینیوم` | 64 |
| چهارپهلو | 14 | `انواع-ورق/چهارپهلو` | 14 |
| لوله جدار چاه | 13 | `انواع-لوله/لوله-جدار-چاه` | 28 |
| ورق مسی | 9 | `انواع-ورق/ورق-مسی` | 9 |
| ورق شیروانی | 9 | `انواع-ورق/ورق-شیروانی` | 9 |
| آلوزینک | 6 | `انواع-ورق/آلوزینک` | 6 |
| ورق ضد سایش | 6 | `انواع-ورق/ورق-ضد-سایش` | 6 |
| ورق دریایی | 5 | `انواع-ورق/ورق-دریایی` | 5 |
| چهارپهلو آلیاژی | 5 | `انواع-ورق/چهارپهلو-آلیاژی` | 5 |

A strong corroboration: for most of these the price already in `current_prices`
matches the ahanonline row to within a few تومان (تسمه 111,363 vs their
111,364; کوپلر and ورق استیل identical to the rial). These SKUs were seeded by
hand *from these very pages* — which confirms the page↔sub-category mapping and
explains why nothing had refreshed them since.

Eight further pages resolve but publish **zero** priced rows and were
deliberately not mapped (`آلومینیوم/میلگرد-آلومینیوم`,
`آلومینیوم/لوله-آلومینیوم`, `آلومینیوم/نبشی-آلومینیوم`,
`آلومینیوم/سپری-آلومینیوم`, `انواع-پروفیل/پروفیل-آلومینیوم`,
`استنلس-استیل/تسمه-استنلس-استیل`, `مس`, `آلومینیوم`). This is why the 188-SKU
فلزات رنگی category cannot be closed the way its size suggests: ahanonline
sells aluminium and copper *sheet*, and its aluminium rebar/pipe/angle/profile
pages are SEO shells.

### The other ten candidates

| Source | Verdict |
|---|---|
| **esfahanahan.com** | Best data of any source; closes **none** of the gap — see below |
| ahanjam.com, ahanmelal.com, kilooton.com, shahrahan.com | Reachable, carry some of the same lines; not pursued once ahanonline covered them with a parser already trusted in production |
| parsianahan.com, markazeahan.com, digiahan.com | No gap keywords found on the homepage |
| iranahan.com, foulad24.com | Unreachable from this host (connection failure / 20s timeout) |
| self-hosted `tgju-api` | Exposes only `/api/price/currency` and `/api/price/gold`; no commodity endpoints |

### esfahanahan.com — the honest negative result

Worth stating plainly, because it is the obvious next reach: it is already our
شمش feed (PR #233) and its data is genuinely better than ahanonline's. Every
product page embeds `__NEXT_DATA__` with per-variation price, explicit `واحد`,
`سایز`, `آنالیز`, `محل تحویل`, `وزن شاخه` and its own `price_updated_at` — on
an ordinary product URL, not the `Disallow: /api/*` endpoint the billet poller
uses.

All 133 product pages were harvested: **1,308 variations, 4 failures.**
Searching every one of them for the lines we need:

| آلومینیوم | استیل | استنلس | مس | کوپلر | شیروانی | گریتینگ | تسمه |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |

Its catalogue is میلگرد (539), ورق سیاه (94), نبشی (93), قوطی, تیرآهن, کلاف —
every one a line ahanonline already covers and the mirror already syncs.
Building a second matcher for it would have added a source, a precedence rule
and a failure mode while closing zero stale SKUs. It remains valuable as a
corroborating second opinion on ferrous prices and as the billet feed it is.

**So: full 8-source coverage is not realistic, and more importantly not
useful.** One source, used properly, covers what eight were being asked to.

## What was built

### The identity rule, generalised — not relaxed

The new pages mostly do not brand their rows, because the mill is not what sets
the price:

- **ورق استیل** — `آلیاژ` 304L vs 316L is **1.7×** (640,909 vs 1,109,091 T/kg); no mill published at all
- **کوپلر** — `نوع` at one size spans **14×** (82,800 → 1,196,000 T/عدد)
- **تسمه** — `حالت` (نوردی/فابریک/ماشینکاری) is **1.5×**

The old rule was "the mill must agree". Dropping to "same size wins" for these
would be the exact failure that once priced «نبشی لقمه ۱۰» from a plain نبشی
row at +121%.

`IDENTITY` instead lets each family declare which column carries its identity
and where our copy of it lives (`factory`, or tokens in the SKU name). **The
bar is unchanged** — an explicit, published token must agree on both sides —
only the *field* varies. Two new skip reasons keep the failure modes apart:

- `skip:sku-missing-variant` — the source distinguishes by آلیاژ/نوع/حالت and
  our SKU does not say which. **Fixable in our catalogue**, and the admin page
  now names it in Persian.
- `skip:source-has-no-variant` — their rows differ only by size. Not mirrorable.

### Three supporting changes

- **`PRICE_BANDS`** — the global 10k–500k band is carbon-steel-per-kg. 316L at
  1,109,091 and copper sheet at 2,481,818 are *correct* prices it would have
  discarded. Per-family bands remain far tighter than the 10× rial/toman flip
  the band exists to catch; the global band is untouched.
- **`unitMatchesBasis`** — کوپلر is «عدد» on both sides, so 65 per-piece SKUs
  became like-for-like. Still no conversion, ever.
- **A latent `norm` bug** — U+066B (Persian decimal separator) was not folded,
  so «۱٫۵» parsed as *two* numbers, 1 and 5, and a 1.5mm sheet size-matched the
  1mm row. Harmless until now; hit immediately by the sub-millimetre gauges
  these pages are keyed on.

## Verification

The production `matchSku` was run against the live SKU export and the freshly
fetched pages (a throwaway harness, not committed):

| Sub-category | Writes / stale |
|---|---:|
| sheet/strip (تسمه) | 93 / 93 |
| rebar/coupler | 65 / 65 |
| sheet/steel | 47 / 47 |
| felezat-rangi/aluminum-sheet | 19 / 24 |
| profile/chaharpahlu | 14 / 14 |
| pipe/well-casing | 13 / 13 |
| felezat-rangi/copper-sheet | 9 / 9 |
| sheet/roofing | 9 / 9 |
| sheet/aluzinc, sheet/wear-resistant | 6 / 6 each |
| sheet/marine, profile/chaharpahlu-alloy | 5 / 5 each |
| **Total** | **291** |

**Zero of the 291 move a stored price by more than 25%** — the strongest
available evidence that the mapping is right rather than merely permissive. The
4 refusals left are all "this mill does not stock this thickness" (ورق
آلومینیوم ۴ پارس against an اراک-only row).

Gates: `tsc --noEmit` clean on all touched files (three pre-existing
`ahantime-logo.png` import errors are unrelated and present on `main`);
`next lint` clean; **55 tests pass** (40 in the matcher — 15 new — plus the
service and integration suites). Per the brief the full vitest suite was not
run on this box; CI will.

## Before / after

| | Fresh SKUs | Share |
|---|---:|---:|
| Before | 251 / 1,133 | 22% |
| After | 542 / 1,133 | **48%** |

## Deliberately left alone

Reported rather than forced, with the reason:

| Line | SKUs | Why |
|---|---:|---|
| میلگرد استیل | 45 | Keyed on 304L/310S/316L; our names carry a *country* (هند/تایوان/چین), which does not move the price, and no alloy |
| لوله مسی | 45 | `price_basis='coil'`; no page publishes a per-coil price |
| لوله استیل | 28 | Keyed on `رده`; our names carry neither رده nor alloy |
| تسمه مسی | 18 | One price published for 18 different sections, no unit column |
| سیم‌مفتول / سیم‌جوش استیل | 15 | Keyed on آلیاژ; our names omit it |
| ساندویچ پانل, گریتینگ, وال پست | 18 | `sqm`/`branch` bases with no matching source unit |

## Two catalogue problems found on the way

Not fixed here — both are owner decisions, and neither is a sync bug:

1. **لوله مسی has triplicated SKUs** — three rows per (size, mill) at three
   different prices (e.g. ۱/۲ اینچ بابک at 8,521,500 / 10,094,700 /
   10,881,300). Mirroring would write one price onto all three and hide the
   duplication.
2. **لوله استیل holds the same size at 886,805 and 1,700,000** — an ~2×
   internal disagreement that should be settled before any source writes to it.

## Follow-ups worth doing

- **Re-diff `AHANONLINE_TARGETS` against their sitemap periodically.** This
  whole gap existed because a page list captured once in 1405/05 was never
  checked again. `docs/price-sync-source-survey.md` §7 has the three steps.
- **Add the alloy to میلگرد استیل and رده to لوله استیل SKU names** — that
  alone converts 73 `skip:sku-missing-variant` rows into writes with no code
  change, and the admin page now tells the owner exactly which SKUs they are.

---

<a id="agent-report-price-coverage-gap"></a>

## Source: `AGENT_REPORT_price_coverage_gap.md`

# AGENT_REPORT — closing the price-coverage gap (US-05.3 / US-05.4)

**Date:** 1405/06/01 · 2026-08-23
**Branches:** `price-sync-stainless-grade` · `admin-price-age-view`
**Both branched off `main@d2088f9`, both left open for review. Neither merged.**

---

## The headline

The brief asked for two things and one of them turned out not to need doing.

**Part 1 was not a data-entry job.** The multi-source survey concluded that
میلگرد/لوله/سیم‌مفتول/سیم‌جوش استیل could not be mirrored because «our SKU names
carry a country (هند/تایوان/چین) and no alloy», and proposed renaming 73 SKUs to
put the alloy into the name. That was true of the **names** and false of the
**catalogue**: `skus.grade` already holds 304 / 304L / 310S / 316L on all 55
stainless SKUs. The matcher never selected the column. Reading it unlocks
**67 of 78** in-scope SKUs across **seven** product lines, and **no SKU data was
changed at all** — the dry-run script found nothing to change, which is a better
outcome than the rename it was written to propose.

**Part 2 was the real gap.** `stalenessJob` has been recomputing
`current_prices.is_stale` every ten minutes since it was written, and nothing
reads the column. The grid's «فقط کهنه‌ها» filter computes the same thing live
and, on production today, selects **624 of 975** price rows — a flag that fires
on two thirds of the catalogue tells an operator nothing. `/admin/pricing` now
carries a real age column, a selective threshold, and a catalogue-wide count.

---

## Coverage, before and after

Live figures from the production DB on 2026-08-23 21:00 UTC.

### Catalogue state

| | Active SKUs | With a price row | Never priced |
|---|---:|---:|---:|
| | 782 | 697 | 85 |

Age distribution of the 552 price rows on active SKUs under an active
sub-category — bimodal, because the mirror wrote half the catalogue this morning
and the rest was last touched in a bulk pass:

| Age | Rows |
|---:|---:|
| 0 days | 262 |
| 3 days | 248 |
| 4 days | 42 |

### Matcher coverage

|  | In scope for the mirror | Writes |
|---|---:|---:|
| Before (`main@d2088f9`) | 607 | 351 (last live run) |
| After, the 7 new families alone | +78 | **+67** |

Full-catalogue dry run on the branch: **211 writes, of which 0 move a stored
price by more than 5%.** (The run also hit two `body too short (3341 bytes)`
rate-limit blocks on the two میلگرد pages — a transient ahanonline response, not
a regression; the targeted run below fetched everything cleanly.)

---

## Part 1 — the استیل lines

### How each alloy was confirmed, not guessed

The `grade` column was **not** taken on trust. Every page was fetched live on
1405/06/01 and parsed with the production `parseAhanonlinePage`, and the check
was: does the price we already store equal the price ahanonline publishes for
**that alloy**?

| Our SKU | `grade` | Our stored price | Their row | Their price |
|---|---|---:|---|---:|
| میلگرد استیل ۱۲ هند | 304L | 831,818 | `میلگرد-استیل` `standard=304L` size 12 | 831,818 |
| میلگرد استیل ۱۲ چین | 316L | 1,218,181 | same page, `standard=316L` | 1,218,182 |
| میلگرد استیل ۱۲ تایوان | 310S | 1,919,090 | same page, `standard=310S` | 1,919,091 |
| میلگرد استیل ۶ تایوان | 310S | 1,939,090 | same page, size 6 | 1,939,091 |
| میلگرد استیل ۱۲۰ هند | 316L | 1,309,090 | same page, size 120 | 1,309,091 |
| لوله استیل ۵ اینچ | 304 | 906,284 | `لوله-استیل-صنعتی` `آلیاژ=304` | 896,545 / 916,023 (median 906,284) |
| لوله استیل ۳ اینچ | 316L | 1,700,000 | same page, `آلیاژ=316L` | 1,700,000 |
| نبشی استیل ۴۰×۴۰ | 304 | 850,909 | `نبشی-استیل` `آلیاژ=304` | 850,909 |
| ناودانی استیل ۱۰ | 304L | 909,090 | `ناودانی-استیل` `آلیاژ=304L` | 909,091 |
| پروفیل استیل ۳۰×۲۰ | 304 | 840,175 | `پروفیل-استیل` `آلیاژ=304` | 840,175 |
| سیم‌جوش استیل ۳ | 316L | 1,354,545 | `سیم-جوش-استیل` `آلیاژ=316L` | 1,354,545 |
| سیم‌مفتول استیل ۳ | 316L | 1,237,354 | `سیم-مفتول-استیل` `آلیاژ=316L` | 1,237,355 |

Agreement to the rial across three different alloys at three price tiers 2.3×
apart is not a coincidence: these SKUs were hand-seeded from these very pages,
and the seeder put the alloy in `grade` while the namer put the country in
`name`. The prices independently confirm the column.

The **dry run over all 78 in-scope SKUs reproduced every one of the 67 stored
prices to within 1 توман** (`+0.00%` on every line; the 1-Toman deltas are their
own display rounding). A mapping that reproduces the existing catalogue exactly
is the strongest evidence available that it is right rather than merely
permissive.

### Which SKUs got unlocked

| Family | Writes / in scope |
|---|---:|
| `rebar/stainless` — میلگرد استیل | 30 / 32 |
| `steel/pipe` — لوله استیل | 14 / 15 |
| `steel/channel` — ناودانی استیل | 6 / 6 |
| `steel/profile` — پروفیل استیل | 5 / 12 |
| `steel/angle` — نبشی استیل | 4 / 5 |
| `wire/welding-wire` — سیم‌جوش استیل | 4 / 4 |
| `wire/wire-rod` — سیم‌مفتول استیل | 4 / 4 |
| **Total** | **67 / 78** |

### The 11 that still skip, and why

**9 × `skip:no-size-match` — they do not list the size.** پروفیل استیل ۶۰×۶۰,
۸۰×۸۰, ۱۰۰×۱۰۰, ۴۰×۶۰, ۵۰×۱۰۰, ۲۰×۴۰, ۲۵×۵۰ (their table carries 7 rows, none
of them these); نبشی استیل ۲۰×۲۰; میلگرد استیل ۵.

**2 × `skip:variant-not-stocked` — a NEW reason code added here.** میلگرد ۶ is
310S-only on their table and our SKU is 304L; لوله ۲½ اینچ is 304-only and ours
is 316L. Under the existing `skip:sku-missing-variant` the admin panel would
have told the operator «آلیاژ/نوع این کالا در نام آن ثبت نشده» — go and fill in
a field that already holds the right value. It now says «منبع این سایز را در
این آلیاژ ندارد».

### What was NOT done, deliberately

- **No SKU renamed, no `grade` written.** The alloy was already correct on all
  55 rows. Nothing was fabricated and nothing needed to be.
- **`رده` (schedule 10/40/80) for لوله استیل was not invented.** Our SKUs do not
  carry it and there is no column for it. It turns out not to matter for 12 of
  the 15: every رده at a given (size, alloy) carries one price on their table.
  For ۲ اینچ 316L they differ (1,700,000 at رده 40, 1,800,000 at رده 10) and the
  existing 8% `maxCandidateSpreadPct` gate lets the median through at 1,750,000
  — which is exactly what we already store. Where رده genuinely could not be
  determined, nothing was guessed.
- **No ninth source was sought.** As instructed, and the survey's conclusion
  stands.

### Also fixed on the way

- **`INCH_KEYS`** — `INCH_CATEGORIES` is keyed on the *category* slug and لوله
  استیل sits under `steel`, not `pipe`. Without this, «۲½ اینچ» fell through to
  the generic "first number agrees" rule, where ۲½ and ۲ are the same product.
- **`STRICT_DIM_KEYS`** for نبشی/پروفیل استیل — their table carries 30\*20 and
  30\*30 at different prices, so a shared first number must not be enough.
- **Per-family `PRICE_BANDS`** — every stainless price is above the global
  500,000 carbon-steel ceiling. Without a band each correct match above would
  have been thrown away as `price-out-of-band`.
- **The `grade` identity mode demands EQUALITY, not the `name` mode's token
  containment.** «304» is a substring of «304L» and a different alloy at a
  different price (886,806 vs 831,818 T/kg on their own tables today).

---

## Part 2 — categories that are structurally un-mirrorable

Confirmed against the live pages, and left alone rather than forced:

| Line | Active SKUs | Why it will never auto-sync |
|---|---:|---|
| لوله مسی | 15 | `price_basis = 'coil'`; no source publishes a per-coil price. Also holds 3 duplicate rows per (size, mill) at different prices — mirroring would write one price onto all three and hide the duplication. |
| تسمه مسی | 18 | Their table publishes **one** price for 18 different sections with no unit column. Un-mirrorable at any confidence. |
| ساندویچ پانل | 4 | `sqm` basis, free-text «نام کالا» sizes, no stable identity to key on. |
| گریتینگ | 1 | Same. |
| وال پست | 8 | `price_basis = 'branch'`; source publishes no matching unit, and converting would require `theoretical_weight_kg`, which is unverified seed data. |
| میلگرد/لوله/نبشی/ناودانی/پروفیل آلومینیوم | 89 | ahanonline's aluminium rebar/pipe/angle/profile pages resolve but publish **0 priced rows** — SEO shells. Verified, and deliberately not mapped: mapping them would only manufacture a «page failed» line every run. |

These add up to ~135 SKUs that no amount of matcher work will reach. That is the
whole reason Part 2 exists: the responsible answer is not a forced match, it is
making sure a person sees them on a cadence.

---

## Part 2 — the staleness view

### The threshold decision, and what was deliberately not changed

There were two candidate definitions and they answer different questions:

| | `isStale` (existing) | `needsReview` (new) |
|---|---|---|
| Means | not priced during the current Jalali day | untouched for 5+ days |
| Audience | **customers** — «کهنه» badge on the public catalogue, and the AI advisor quotes the price with its date | **admins** — a work queue |
| Fires on (production, today) | **624 of 975** price rows | 0 |

**The customer-facing definition was left exactly as it is.** It is correct for
what it does: a customer deserves to know a number was last confirmed yesterday
even when yesterday's number is still right. Repointing it at a 5-day window
would change what the public site shows and what the advisor says — a product
decision, and not one to make from an admin screen. `stalenessJob` is likewise
untouched; the column it writes remains unread by anything, which is a separate
cleanup, not this one.

**5 days**, for two reasons that agree:

1. The Iranian working week is Saturday–Wednesday. Five days is one of them, so
   «needs review» means *this survived a whole working week with nobody and
   nothing touching it* — a real failure of the pricing routine, not a quiet
   stretch.
2. It sits above the mirror's rhythm (08:00 and 12:00 daily) and below
   `PRICE_STALE_HIDE_AFTER_DAYS`, the point at which the public site withholds
   the number entirely. By the hide threshold the damage is done; this one is
   meant to be crossed first.

### What was built

- **`عمر قیمت` column** — days since `current_prices.updated_at`, «امروز» when
  fresh, a `loss`-tone badge past the threshold, «—» for a never-priced product.
- **Sortable**, tri-state: oldest → newest → back to catalogue order, with
  `aria-sort` on the `<th>` and a screen-reader description of the next action.
- **«نیازمند بازبینی (N)» filter chip**, deep-linkable as `?review=1`.
- **`.rowAged` row tint**, ranked below every edit state so it never paints over
  feedback for what the operator just typed.
- **Catalogue-wide summary** above the table: «N قیمت در کل کاتالوگ بیش از ۵ روز
  است به‌روز نشده…», with a link into the current category's subset — scoped to
  the whole catalogue on purpose, because the lines that go untouched longest
  (لوله مسی, تسمه مسی) are exactly the ones nobody navigates to.
- **`pricesNeedingReview`** on `/api/admin/stats`, behind the same
  `pricing:write` permission as the other pricing tiles.

### Two bugs the live data caught

Both were found by running the real page against the production DB, not by
reading the code:

1. **`pricesNeedingReview` reported 1 that the grid could reach 0 of.** It
   counted bare `current_prices`; the one 47-day-old row was «میلگرد آجدار ۱۰»,
   whose SKU had been **deactivated** — a price row outlives its product. Now
   scoped to active SKUs under an active sub-category, exactly what the grid
   lists. A work-queue number nobody can act on is worse than no number.
2. **A never-priced product leaked into the review queue.** It still arrives
   with an `updatedAt` (the admin DTO's default), so the filter's first render
   offered «میلگرد آجدار ۱۲ آناهیتا گیلان» — never priced in its life — as a
   price that had gone stale. Never-priced is already its own queue, with its
   own explanation of why the mirror declines to guess.

### It rendering real data

`/admin/pricing` served from the branch against the **production database**.
Screenshot: `staleness-view.png` (in the `admin-price-age-view` branch root).

Because today's real queue is 0 — the 42 rows at 4 days cross the threshold
tomorrow — the capture advances the **browser clock** by two days. Age is
computed client-side from each row's real `updated_at`, so every product, price
and date below is live production data; only "now" is shifted. The catalogue-wide
banner is absent in the capture for the same reason: the server count is computed
server-side and correctly reads 0 today.

```html
<tr class="adminUi_rowAged__kDIlN">
  <td>میلگرد آجدار ۱۰ ابرکوه</td>
  <td class="tnum">۱۰</td>
  <td>ابرکوه</td>
  <td><input class="adminUi_numInput__NW_Pw" value="۷۰,۱۸۱" aria-label="قیمت میلگرد آجدار ۱۰ ابرکوه"></td>
  <td><input class="adminUi_textCell__D3KGM" value="۲۴ ساعت"></td>
  <td>—</td>
  <td><button class="adminUi_sparkButton__qtRKw" aria-label="تاریخچهٔ قیمت میلگرد آجدار ۱۰ ابرکوه">…</button></td>
  <td class="tnum"><span class="Badge_badge__V4FiA Badge_loss__YqaH0">۶ روز</span></td>
  <td><span class="Badge_badge__V4FiA Badge_loss__YqaH0">مخفی</span>
      <div class="adminUi_tileHint__7Q1Br">۱۴۰۵/۰۵/۲۸</div></td>
</tr>
```

Header, with the sort applied:

```html
<th scope="col" aria-sort="descending">
  <button type="button" class="adminUi_sortButton__…">
    عمر قیمت<span aria-hidden="true"> ↓</span>
    <span class="visually-hidden"> — مرتب‌شده از قدیمی‌ترین؛ برای مرتب‌سازی از تازه‌ترین فعال کنید</span>
  </button>
</th>
```

Observed live: chip reads «نیازمند بازبینی (۳۵)», the filtered table holds
exactly 35 rows, sorting puts the ۶ روز rows above the ۵ روز rows, and the
never-priced row is correctly absent from both.

---

## Gates

| | `price-sync-stainless-grade` | `admin-price-age-view` |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| `next lint` (touched files) | clean | clean |
| `stylelint` | n/a | clean |
| Targeted vitest | 46 pass (6 new) | 35 pass (11 new) |

The three pre-existing `ahantime-logo.png` import errors are present on `main`
and unrelated. Per the brief the full vitest suite was **not** run on this box
(past OOM); CI will.

---

## Follow-ups worth doing, not done here

- **`current_prices.is_stale` is dead weight.** `stalenessJob` writes it every
  ten minutes and every reader computes freshness live instead. Either delete
  the column and the job or point something at it — but that is a separate
  change with its own migration.
- **The 85 never-priced SKUs** are surfaced correctly by PR #230 and untouched
  here, as instructed.
- **لوله استیل holds duplicates** at 886,805 and 1,700,000 for the same size —
  which this work explains: they are 304 and 316L, not a data error. Worth
  confirming with the owner that both are meant to be listed.
- **Re-diff `AHANONLINE_TARGETS` against their sitemap periodically.** Their
  sitemap now lists 352 `/product-category/` pages; we map 55.

---

<a id="agent-report-price-sync-100pct"></a>

## Source: `AGENT_REPORT_price_sync_100pct.md`

# AGENT_REPORT — pushing price-sync toward 100% coverage (US-05.3)

**Date:** 1405/06/03 · 2026-08-26
**Branches / PRs, all pushed to `origin`, none merged:**

| PR | Branch | Title |
|---:|---|---|
| [#279](https://github.com/Am1eza/Iron/pull/279) | `price-sync-new-source-pages` | mirror the 11 specialty pages the sitemap diff turned up |
| [#280](https://github.com/Am1eza/Iron/pull/280) | `price-sync-nearest-analog` | price a SKU from its nearest analog, flagged as تخمینی |
| [#281](https://github.com/Am1eza/Iron/pull/281) | `price-sync-markazeahan-aluminium` | add markazeahan as a second source for the aluminium extrusions |
| [#282](https://github.com/Am1eza/Iron/pull/282) | `price-sync-100pct-report` | this report + the survey doc's third pass |

They are **stacked in that order** (#280 targets #279, #281 targets #280, #282
targets #281). Review and merge front to back. Because this repo squash-merges,
each follow-up will need `git rebase --onto origin/main <old-base> <branch>`
after the one before it lands.

---

## 1. The headline

| | Written | Share of 782 active SKUs |
|---|---:|---:|
| **Live in production right now** | 349 | **44.6%** |
| Baseline on `main`'s code | 420 | 53.7% |
| after #279 | 502 | 64.2% |
| after #280 | 537 | 68.7% |
| after #281 | **565** | **72.3%** |

Two separate things are in that first gap and they need different actions.

**The production container is 40 commits behind `main`.** It runs
`ghcr.io/am1eza/iron-web:d2088f95`, which predates PR #243 — the one that
unlocked the seven استیل families by reading the alloy out of `skus.grade`.
That is 78 SKUs already fixed, merged, and simply not deployed. **The single
highest-value action tonight is a deploy, before any of these PRs.** It moves
live coverage 349 → 420 with code that is already reviewed.

Everything below is measured against the 420 baseline, not the 349, so no
credit is taken for work that was already done.

## 2. Methodology, so the numbers are reproducible

Every figure comes from running the **production** `parseAhanonlinePage`,
`parseMarkazeahanPage` and `matchSku` — not a re-implementation — against:

* the live SKU export (`782` rows, `is_active = true`, exported 2026-08-26 05:2x UTC), and
* all 65 source pages fetched the same morning.

To redo it:

```sql
select count(*) from skus where is_active = true;
select started_at, source_rows, considered_skus, written, skipped
  from price_sync_runs order by started_at desc limit 5;
```

```sql
-- per-sub-category truth for the last run
with run as (select id from price_sync_runs order by started_at desc limit 1),
e as (select sku_id, outcome, reason from price_sync_entries where run_id=(select id from run))
select c.slug, sc.slug, count(*) n,
       count(*) filter (where e.sku_id is null) never,
       count(*) filter (where e.outcome='written') wrote,
       string_agg(distinct e.reason,',') filter (where e.outcome='skipped') reasons
from skus s join sub_categories sc on sc.id=s.sub_category_id
            join categories c on c.id=s.category_id
       left join e on e.sku_id=s.id
where s.is_active group by 1,2 order by never desc, n desc;
```

Note the trap: `price_sync_runs.considered_skus` counts only SKUs whose
sub-category has a `SOURCE_PATHS` entry. It read **529** — so the run log's
"349 written of 529 considered, 66%" is not the coverage number. Against all
782 active SKUs it is 44.6%. Every figure in this report is against 782.

## 3. What was actually wrong

The prior report's numbers were three days old and the catalogue had moved
under them (میلگرد استیل 45 → 32, لوله مسی 45 → 15). Re-derived from scratch,
the 362-SKU gap on `main` was:

* **175 never considered** — no `SOURCE_PATHS` entry at all.
* **187 skipped**, of which 113 `low-confidence-match` and 47 `no-size-match`.

The prior report attributed most of the first group to lines "ahanonline
structurally does not sell". That was true of four aluminium pages and wrong
about everything else. **ahanonline's sitemap lists 350 `/product-category/`
pages; the job was pointed at 51.** وال پست, گریتینگ, ساندویچ پانل, ورق کرکره,
پروفیل کنگره, قلع‌اندود, میلگرد حرارتی, لوله مسی and تسمه مسی all had a live,
priced page nobody had mapped.

This is the same failure as the first pass, one level down: §7 of
`docs/price-sync-source-survey.md` explicitly asked for the sitemap diff to be
re-run periodically, and it never was.

## 4. What each PR does

### #279 — eleven more ahanonline pages (+82 SKUs, 420 → 502)

Full detail in the PR and in the survey doc's new §8. The mechanisms are all
"read a field that was already published":

* `PAGE_UNIT` — three tables publish no «واحد» and are not per-kg (وال پست per
  شاخه, ورق پانچ per برگ).
* `HALAT_UNIT` — لوله مسی sells the same size, mill and ضخامت as a 15-متری coil
  and a 6-متری length, **3.5× apart**, and «حالت» is the only thing that says
  which. Modelled as the row's unit, which lines it up with
  `price_basis = 'coil'` on all fifteen SKUs.
* `from: 'size-only'` — four families whose mapped page sells one product and
  publishes no mill on either side. **This is the mode that caused the «نبشی
  لقمه ۱۰» +121% write**, so it is opt-in per family and does not bypass the
  ambiguity gate: if one of those tables gains a second variant, its rows
  spread apart and the family starts skipping on its own.
* `from: 'grade-number'` — «ضخامت ۰.۸۱» vs «0.81». Numbers, not strings.
  Deliberately never used for alloys, where «304» ⊂ «304L».
* `GROUP_COLUMN`, `NAME_FACTORY_PATHS`, plus «اسپیرال» as a factory stopword
  (which alone turns all 12 لوله اسپیرال SKUs from fuzzy-and-skipped into
  **exact** — they were the same mill written two ways) and `ظفر بناب → بناب`.

**Evidence it is right and not merely permissive:** of 502 writes, exactly one
moves a stored price by more than 25%, and each new family lands on a single
constant delta — the signature of a hand-seeded catalogue that stopped being
refreshed. تسمه مسی 0.0% × 18. ساندویچ پانل 0.0% × 4. وال پست 5.0% × 7.
قلع‌اندود 7.5% × 5. کنگره 7.5% × 6. کرکره 5.3% × 5. لوله مسی 13.1/16.8/19.7%
by mill — ahanonline's own published نوسانات for باهنر, بابک and مهر اصل that
day.

### #280 — nearest analog, flagged as an estimate (+35 SKUs, 502 → 537)

This is the part you asked for, and it is deliberately narrower than "find a
similar product", because that question is unanswerable and answering it is
exactly how «نبشی لقمه ۱۰» got priced off a plain نبشی row.

It asks instead: **does the mill move the price in this family, right now, on
this page?** The source answers it. If every size-matching, unit-compatible,
in-band, fresh row agrees within 5%, then the mill demonstrably is not what
sets the price for that size today, and their median *is* the market rate. If
they disagree, the mill matters and the SKU skips exactly as before.

Five constraints, in rough order of how much they matter:

1. **Corroboration, not arithmetic.** A single row has a 0.0% spread by
   definition and proves nothing — that is the shape of the audit's worst
   write, «تیرآهن هاش سبک ۱۸ فایکو» from one ذوب آهن row at **+447%**. So an
   analog needs ≥2 distinct published mills agreeing, *or* a page that brands
   no row at all (پروفیل گالوانیزه groups by thickness: one published market
   price, nothing claiming to be a mill's). Exactly one mill is refused. This
   rule cost 22 SKUs against a naive spread gate and it is the most important
   line in the change. **It was found by a test, not by inspection** — an
   existing case asserting the +447% scenario went green when it should not
   have.
2. **Never past a variant.** An آلیاژ / نوع / حالت / رده disagreement returns
   before the fallback is reached. Nearest-analog fills a gap in the source's
   *mill* coverage and nothing else. This is your safety lesson, encoded.
3. **Never across a size.** The pool is the rows the exact path already
   size-matched. Nothing interpolates. (See §6 — this is the one place where I
   deliberately did less than the brief allowed, with a number attached.)
4. **Every downstream gate re-applied** — unit, price band, freshness,
   factory-gate delivery preference.
5. **`ANALOG_DENYLIST`** — تیرآهن, تیرآهن سبک, هاش سبک, هاش سنگین, پروفیل Z.
   The beam pages interleave domestic and imported stock, which is a different
   product rather than a spread, and on a given day a size can list only mills
   that happen to agree.

**Telling an estimate apart from a mirrored price**, end to end:

* `write:nearest-analog` — a distinct reason on every `price_sync_entries` row;
* `current_prices.price_is_estimated` — migration `0045`, additive and
  defaulted, so every existing row keeps meaning `FALSE`;
* the flag **clears itself** on any other write. A human typing a price into
  the admin grid is the act of replacing an estimate with a real number, so no
  caller has to remember to clear it;
* the admin sync panel labels those rows **«قیمت تخمینی بر اساس نزدیک‌ترین
  محصول مشابه»** in a `warning` badge rather than the `success` one an exact
  write gets.

`maxAnalogSpreadPct` is a stored setting and **0 turns the whole feature off** —
a kill switch separate from `enabled`, so you can drop the estimates without
losing the 502 exact writes with them.

Why 5%: chosen from the data. Across the 35 SKUs it admits, the move against
the stored price runs **−2.2% to +9.2%, median 6.6%** — which is the margin our
catalogue already sits below ahanonline by on the families that *do* match
exactly. 8% adds 8 more SKUs, 25% adds 34, all in families whose rows visibly
disagree about the product.

### #281 — markazeahan, for the aluminium extrusions (+28 SKUs, 537 → 565)

ahanonline's five aluminium-extrusion pages resolve, rank and parse to **zero**
priced rows. They are SEO shells, re-confirmed 1405/06/03. No further work on
that mirror reaches those 89 SKUs.

markazeahan publishes all of them, and our stored price equals theirs **to the
toman** on every line (لوله 640,000, نبشی 630,000, ناودانی 630,000, پروفیل
650,000). 28 of 32 write; the 4 that do not are sizes their table does not
carry.

Taking a second source on means taking its weaknesses on, and both are
load-bearing: it publishes the price **once** (no rial cross-check, so
`PRICE_BANDS` alone stands between a units change and a 10× write — hence ±40%
bands), and its freshness date is **per page**, stamped onto every row so the
existing gate works, with a page that loses the stamp parsing to zero rows.

No precedence rule was needed: markazeahan is mapped only to families
ahanonline publishes nothing for, so no SKU can be priced by both.

---

## 5. What is still not priced, and why — all 217

| Bucket | SKUs | Closeable? |
|---|---:|---|
| میلگرد آلومینیوم | 57 | **No** — see below |
| Source does not carry the size (`no-size-match`) | 58 | Only by crossing a size — §6 |
| Mill published on both sides and disagrees, spread too wide (`low-confidence-match`) | 66 | No — the mill is the product there |
| تیرآهن / هاش priced per شاخه against our per-kg SKUs | 15 | Only via `theoretical_weight_kg` — §6 |
| `sku-missing-variant` / `ambiguous` / `sku-has-no-factory` | 7 | **Yes, in our own catalogue** — §7 |
| Never considered: نبشی لقمه, نبشی بال نامساوی, لانه‌زنبوری | 14 | No — deliberately unmapped, §7 |

### میلگرد آلومینیوم — 57 SKUs, and I could not price them honestly

This is the largest single block left and the one I most wanted to close.
markazeahan carries the line at 620,000, exactly matching our stored price —
which looks like a 57-SKU win until you read the page's own «به روز رسانی»:
**1405/02/12, about 110 days ago**, with 30 of its 40 rows reading «تماس
بگیرید». Our number and theirs agree because *both* stopped moving.
ahanyekta's equivalent page is staler still (1404/03/07).

Aluminium rebar is not a line the Iranian price aggregators keep current. The
page is left unmapped rather than fetched twice a day to be thrown away by the
freshness gate. **These 57 SKUs cannot be automatically priced from any public
source I could find that maintains its numbers**, and I would rather say that
than write 620,000 twice a day and have it look fresh.

---

## 6. Two things I deliberately did NOT do, with the numbers

You explicitly allowed nearest-size interpolation. I did not implement it, and
here is the trade so you can overrule me:

**Nearest *size* would close up to 58 more SKUs** (`no-size-match`) — لوله
گوشت‌دار ۸۳×۴۳, پروفیل استیل ۱۰۰×۱۰۰, ورق گالوانیزه ۴/۵/۶, لوله مبلی
۳/۴/۵ اینچ, توری ۴/۵.۵/۶.۵ and so on. That would take coverage to roughly
**80%**. I left it out because crossing a size is precisely the line the «نبشی
لقمه ۱۰» incident drew: a 100mm angle and a 100 spacer share every published
field except the one that matters, and the +121% write passed every confidence
gate. Crossing a *mill* is a claim the source can corroborate (do the other
mills agree?); crossing a *size* is a claim nothing on the page supports.

Some of those 58 are worth a second look as **catalogue** questions rather than
matcher ones — ورق گالوانیزه ۴/۵/۶mm is thicker than galvanised coil is
normally rolled, and لوله مبلی above 2″ is unusual. It may be that a few of
those SKUs should not be active.

**Per-شاخه → per-kg conversion would close 15 more** (تیرآهن, تیرآهن سبک). It
needs `theoretical_weight_kg`, which the mirror has refused to build on since
the first audit — and per the memory note that column was wrong on 185 SKUs and
is now written only when both the section table and the branch length are
published. I left the refusal in place.

---

## 7. What needs your judgement

### 7.1 Deploy first
`docker inspect ahantime-web-1` → `d2088f95`; `origin/main` → `62539ad`, 40
commits ahead. PR #243 is merged and not live. **+71 SKUs for free.**

### 7.2 The two catalogue problems from the prior report — both resolved, one reclassified

* **لوله مسی triplication is gone.** The prior report saw «۱/۲ اینچ بابک» at
  three prices. Today there are exactly 15 SKUs — 5 sizes × 3 mills — each
  with `grade = 'ضخامت ۰.۸۱'`, one row per pair. Nothing to fix.
* **لوله استیل's "~2× internal disagreement" was never a bug.** 14 of the 15
  are 316L at 1.70–1.85M and one (۵ اینچ) is 304 at 906,284. Different alloys,
  correctly ~2× apart, and PR #243's `grade` mapping now matches all 15
  exactly. **The real question is a stocking one:** is ۵ اینچ the only size you
  sell in 304, or should the 304/316L split run across the range?

### 7.3 Three catalogue rows that look wrong

| SKU | Issue |
|---|---|
| **وال پست ۱۵×۲۰** | Stored 127,530. Our own ladder puts ۱۵×۲۰ 17.6% above ۱۰×۲۰; ahanonline's puts it **41%** above. Every other وال پست SKU sits a uniform 5.0% under their row; this one sits 26% under. Our number looks wrong, not theirs — but it is the one write in 565 that moves a price >25%, so it should be a decision, not a side effect. |
| **ورق کرکره ۰.۵ روی اندود** | `factory` is null, so it skips as `sku-has-no-factory`. «روی اندود» is in the name and ahanonline publishes a group by that name. Setting `factory = 'روی اندود'` closes it. |
| **ورق پانچ سیاه ۲ فولاد مبارکه** | Their two rows differ only by ابعاد (1000×2000 vs 1250×2500, 55% apart) and our SKU records no ابعاد. Filling `dimensions` closes it; it is 1 SKU. |

### 7.4 The alloy/رده question from the brief — already answered, by PR #243

The brief asked whether the alloy for میلگرد استیل (32), لوله استیل (15) and
سیم‌مفتول/سیم‌جوش استیل (8) could be determined. **It already is, and it always
was:** `skus.grade` holds 304 / 304L / 310S / 316L on all of them. PR #243 read
it. All 55 now match exactly. No data migration is needed and none should be
proposed — the prior report's "our SKU names carry a country instead of the
alloy" was true of the *names* and false of the *catalogue*.

### 7.5 Should the public price row say «تخمینی»?

`current_prices.price_is_estimated` is populated but **not surfaced publicly**.
`toPriceRow` is shared between the public catalogue and the admin, so showing
it is a decision about what ahantime.com asserts to a customer, not a matcher
change. 35 SKUs are affected today. The data is in place the moment you decide.

My read: the AI advisor is grounded on these numbers and the whole product
promise is «اول مشورت، بعد خرید» with transparent prices. An estimate a
salesperson can see and a customer cannot is defensible — the human closes the
sale — but only if the panel is actually being read. If it is not, surface it.

### 7.6 Diminishing returns, plainly

565/782 is where honest automation gets to today. The next 58 need a rule that
crosses sizes; the 57 after that need a source that does not exist. Getting to
100% from here means inventing numbers, and on a site whose entire
differentiator is that its prices are real, that trade is not worth making.
What *would* move it further, in order of value per unit of risk:

1. Deploy (+71, free, already reviewed).
2. Re-run the sitemap diff on a schedule — twice now the gap has been a stale
   page list, not a missing source. §8.6 of the survey doc has the three steps.
3. Audit the 58 `no-size-match` SKUs as a catalogue question. Several look like
   sizes we should not be listing.

---

## 8. Gates

`tsc --noEmit` clean on every touched file across all four branches — the three
`ahantime-logo.png` import errors are pre-existing and present on `main`.
`next lint` clean. **101 tests pass** across `priceSync.match.test.ts` (69,
against 46 on `main` — 23 new), `markazeahan.test.ts` (12, all new),
`ahanonline.test.ts`, `priceSync.service.pg.test.ts` and
`pricing.adminGrid.pg.test.ts`. Per the project rule the full vitest suite and
`next build` were **not** run on this production box; CI runs them.

One environment note for whoever picks this up: `docker run` on this host
started failing mid-session with `failed to create TTRPC connection:
unsupported protocol: Yunix` for **new** containers (running ones are fine),
so the CLAUDE.md recipe for tooling is currently broken. There is a working
`node` v22 on the host PATH now, which is what the gates above were run with.

Three pre-existing tests were updated rather than deleted, each because this
work changed the contract they asserted, and each rewritten to guard the same
invariant against the new one: "lines the competitor does not sell" now names
the aluminium shells; the two `notPerKgSku` cases now assert that a per-kg row
still cannot price a per-شاخه SKU (the no-conversion rule, unchanged) rather
than that those bases are unmirrorable; and the "mapped but never fetched"
invariant now spans both sources' target lists.

---

<a id="agent-report-price-sync-system"></a>

## Source: `AGENT_REPORT_price_sync_system.md`

# Automated price mirroring — build report

**US-02.5 · branch `feat/price-sync-mirror` · 1405/05/31 (2026-08-22)**

Twice a day the site now reads ahanonline's published prices, matches them to our
SKUs, and writes the confident matches straight into `current_prices`. No draft
step, no approval queue — that was the owner's explicit decision. What that
decision *does* require is that a wrong automated write be noticeable after the
fact, so most of the engineering below is about traceability and about refusing
to write when the match is not certain.

---

## 1. What the prior audits already had, and what I reused

`.claude/audits/ahanonline-price-comparison-2026-08-19/` turned out to contain a
complete, working, *validated* version of the hard part. Its `scripts/fetch.py`,
`parse.py` and `match.py` had already been run against 426 of our SKUs and 1,541
of their rows, producing 220 exact matches, and its per-category medians were
cross-checked for internal consistency (میلگرد 68k < نبشی 75k < ورق سیاه 92k <
پروفیل 105k < لوله گالوانیزه 194k). That is ground truth, not a guess.

**Reused essentially unchanged**, ported to TypeScript:

| Prior art | Ported to | What it does |
|---|---|---|
| `fetch.py`'s 32-page `TARGETS` list | `AHANONLINE_TARGETS` in `integrations/ahanonline.ts` | which category pages carry a line we sell |
| `parse.py` | `parseAhanonlinePage()` | `data-price` / `data-name` / `data-code` extraction, "the nearest preceding bold heading is the mill" |
| `match.py`'s `norm` / `nums` / `inch_value` | `norm` / `nums` / `inchValue` in `services/priceSync.match.ts` | Persian↔ASCII digits, ZWNJ, `×`/`x`→`*`, `۱¼`→1.25 |
| `match.py`'s `fac_score` + `ALIAS`/`STOP` tables | `factoryScore()` | mill-name similarity across free text |
| `match.py`'s `size_match` families | `sizeMatches()` | نبشی cm↔mm, پروفیل unordered `a×b`, لوله inches, ورق thickness-not-`سایز` |
| `match.py`'s `their_size`/`their_factory`/`their_unit` | `rowSize` / `rowFactory` / `rowUnit` | per-page quirks (SHEET_PATHS, NAME_SIZE_PATHS, `NOT_A_BRAND`) |

**Rebuilt / changed, and why** — three things, all because the audit only wrote a
report and this writes prices:

1. **The taxonomy map is keyed on slugs, not Persian names.** `match.py`'s
   `SUB_MAP` keyed on `sub_categories.name`. Three of those names have since been
   reworded — «پروفیل و قوطی» is now «پروفیل», «هاش سبک (HEA)» is now «هاش سبک»,
   «لانه‌زنبوری» is now «لانه زنبوری». A rename would have silently unmapped a
   whole product line and the mirror would have reported "no source" forever.
   `SOURCE_PATHS` is now keyed `categorySlug/subCategorySlug` (ASCII, stable), and
   a test asserts every mapped path is one the fetcher actually requests.

2. **A rial/toman cross-check.** `data-price="735805"` is in **rial**; the visible
   «قیمت (تومان)» cell reads `73,580` — Toman, floored to the nearest 10. Nothing
   on the page states this. `parse.py` just divided by ten. Here a row must
   satisfy *both* readings within 12 Toman or it is dropped. If ahanonline ever
   switches `data-price` to Toman, that surfaces as a skip instead of writing the
   entire catalog at one tenth of its value.

3. **Only `exact` is ever written.** The audit's own §3 is the argument: its
   biggest deltas (+400%) are `uncertain` rows where the size matched and the mill
   did not — their هاش is *imported* stock at ~200,000 T/kg against the
   Iranian-mill هاش our SKUs name, and their پروفیل گالوانیزه / مبلی / هاش pages
   group by thickness and publish no mill at all. `factoryScore` returns 0 when
   either side is blank, so those brandless pages fall out automatically.
   `fuzzy` and `uncertain` are recorded as skips with their reason.

Also read and drawn on: `ahanonline-price-fix-2026-08-19/` (the one-off write pass
and its `unpriced-flagged` list), `catalog-gap-fix-2026-08-20/`,
`catalog-owner-decisions-2026-08-20/`.

**No trace of any "price-deviation-alerts" work exists** — no branch, no worktree,
no commit. Only a stray `price_alert_system_prompt.md` at the repo root, left
untouched.

---

## 2. Schema

Migration `web/drizzle/0043_price_sync.sql`. Purely additive — two new tables and
one new column with a default; nothing is dropped, rewritten or backfilled.

### `price_sync_runs` — one row per pass
`id`, `source`, `trigger` (`cron`|`manual`), `status` (`running`|`ok`|`failed`),
`started_at`, `finished_at`, `source_rows`, `considered_skus`, `written`,
`skipped`, `error`.

It doubles as the **concurrency lock**: `createSyncRun` is an
`INSERT … SELECT … WHERE NOT EXISTS (a run still 'running' within 30 minutes)`,
so the 08:00 cron overrunning into an admin's «اجرای دستی» cannot double-write.
A conditional insert rather than a pg advisory lock because a session-scoped lock
would pin a pool connection for the whole multi-minute pass — exactly what
`scheduler.ts` documents as the thing to avoid against a pool shared with live
traffic.

### `price_sync_entries` — one row per considered SKU per run
`run_id`, `sku_id`, `outcome` (`written`|`skipped`), `reason`, `old_price`,
`new_price`, `source`, `matched_name`, `matched_factory`, `matched_code`,
`matched_unit`, `source_updated_at`, `confidence`, `applied_at`.

Three deliberate choices:

- **Skips are logged too, with the reason.** "Why didn't ورق update?" is as
  important as "why did this price change?", and without the skip rows the answer
  is unobtainable.
- **`reason` stores a stable machine code** (`write:exact`, `skip:no-size-match`),
  never prose. The Persian sentence lives in the admin UI, so it can be reworded
  without rewriting history.
- **SKUs whose sub-category is permanently out of scope get no row at all.**
  Logging ~250 «not mapped» rows for استیل / فلزات رنگی / وال پست twice a day
  would bury the real skips. Scope is filtered in SQL; `considered_skus` on the
  run row records the denominator.

Indexes mirror `audit_entries`: `(run_id, outcome)`, `(sku_id, applied_at)`, and
`(applied_at, id)` for the admin log's keyset pagination.

### `skus.price_sync_excluded` — the manual override
`boolean NOT NULL DEFAULT false`. Default off, i.e. auto-sync applies to
everything unless an admin opts a SKU out, which is what the owner asked for.
Checked *first* in the run loop, before any matching work, so an opted-out SKU
cannot be written even when the matcher would have been confident.

### Settings — `PRICE_SYNC` (jsonb, `settingsRepo.getPriceSyncConfig`)
Follows the `getStaleHideAfterDays` pattern exactly, merged over defaults so a
partially-written row can never leave the job with an undefined bound.

| key | default | purpose |
|---|---|---|
| `enabled` | `true` | kill switch — stop the scheduled run from the panel without a deploy or a crontab edit |
| `categorySlugs` | `[]` (= all) | restrict scope to named categories |
| `minPriceToman` / `maxPriceToman` | `10_000` / `500_000` | plausibility band for a per-kg steel price |
| `maxCandidateSpreadPct` | `8` | equally-good rows that disagree by more than this are ambiguous → skip |
| `maxSourceAgeDays` | `10` | don't mirror a price the competitor themselves stopped maintaining |

The band is not an approval gate the owner declined — it is the same class of rule
as "only write a confident match", and it is what catches the rial/toman failure
mode a second time if the parser's cross-check is ever bypassed.

---

## 3. When a price is actually written

All of these must hold, or the SKU is skipped with the named reason:

| Condition | Skip code if it fails |
|---|---|
| The SKU's `category/sub` slug pair is mapped | `skip:no-source-mapping` |
| The SKU is not flagged `price_sync_excluded` | `skip:manual-override` |
| Our `price_basis = 'kg'` | `skip:sku-not-per-kg` |
| Our SKU names a factory | `skip:sku-has-no-factory` |
| Some row on the mapped page matches the size | `skip:no-size-match` |
| The best factory score is **1.0** | `skip:low-confidence-match` |
| Their row is per-kg (not شاخه/برگ/متر) | `skip:source-not-per-kg` |
| Tied candidates agree within 8% | `skip:ambiguous-candidates` |
| The price is inside the plausibility band | `skip:price-out-of-band` |
| Their row was updated within 10 days | `skip:source-row-stale` |
| The write itself succeeded | `skip:write-failed` |

Per-شاخه competitor rows are **never** converted through
`theoretical_weight_kg` — the audit's §4 showed that column is unverified seed
data (a 12 m IPE-24 carrying 42.7 kg), so converting would manufacture a number
rather than measure one. When several exact rows survive, factory-gate delivery
is preferred over بنگاه and the **median** is taken, so one odd row cannot move a
price alone.

**Writes go through `savePrice`, never raw SQL.** That is the single price write
path, and it is what gives a mirrored price movement% against yesterday's close,
a `price_points` row for the charts, an audit entry, and `is_stale = false`. A
direct `UPDATE` would have left the price stale-flagged — and `getPriceFreshness`
*withholds* a stale price from the public site, so a "successful" sync would have
left the page saying «تماس بگیرید». `savePrice`/`savePrices` now accept a null
actor; both columns it lands in (`current_prices.updated_by`,
`audit_entries.actor_id`) already modelled "system job" as null, so no synthetic
staff user was invented that would read as a person in every «چه کسی» column.

---

## 4. Scheduling, and the timezone arithmetic

A **host cron entry**, not the in-process `scheduler.ts`: that scheduler is a
`setInterval` loop, which can express "every N ms" but not "08:00 and 12:00 Tehran
time", and it would restart its phase on every container restart. An
API-route-plus-secret-token was the other candidate and was rejected — it would
put a new externally-reachable endpoint in front of the code that writes live
prices, guarded only by a shared secret.

`web/scripts/priceSync.ts` is bundled to `scripts-dist/priceSync.mjs` by the same
esbuild step the Dockerfile already uses for `migrate`/`seed`/`jobs`, so the
runner image needs no dev dependencies. Installed in root's crontab:

```cron
CRON_TZ=Asia/Tehran
0 8,12 * * * cd /opt/ahantime && /usr/bin/docker compose exec -T web node scripts/priceSync.mjs >> /var/log/ahantime-price-sync.log 2>&1  # ahantime price mirror
```

### The arithmetic, shown

- Host clock is **UTC** — `timedatectl` → `Time zone: UTC (UTC, +0000)`, NTP
  synchronized.
- Iran observes **no DST** (abolished 2022). Verified on this host rather than
  assumed, in both seasons:

  ```
  2026-08-23 08:00 Tehran  ->  2026-08-23 04:30 UTC   (offset +0330)
  2026-08-23 12:00 Tehran  ->  2026-08-23 08:30 UTC   (offset +0330)
  2027-01-15 08:00 Tehran  ->  2027-01-15 04:30 UTC   (offset +0330)
  2027-01-15 12:00 Tehran  ->  2027-01-15 08:30 UTC   (offset +0330)
  ```

  August is the tell: with DST it would read `+0430`. It reads `+0330`.
- So today the entry fires at **04:30 and 08:30 UTC**. `CRON_TZ` is used anyway
  rather than hardcoding those, so the job stays at 08:00/12:00 Tehran if Iran
  ever reinstates DST.
- `cronie 1.5.7-16.el9` supports `CRON_TZ` (documented in `man 5 crontab`).

### Verified empirically, not just asserted

A temporary probe entry was installed under `CRON_TZ=Asia/Tehran` for `46 20`
(Tehran) and the journal shows it firing at **17:16:01 UTC** — i.e. 20:46 Tehran,
exactly as predicted:

```
Aug 22 17:12:01 crond[1005]: (root) RELOAD (/var/spool/cron/root)
Aug 22 17:16:01 CROND[1693553]: (root) CMD (date -u '+probe fired at )
Aug 22 17:17:01 CROND[1694547]: (root) CMD (cd /opt/ahantime && … matomo core:archive …)
```

The Matomo line firing at 17:17 UTC in the same window confirms the second thing
that had to be true: **`CRON_TZ` is declared *below* the Matomo entry**, so
Matomo's existing `17 * * * *` keeps its UTC meaning. Had `CRON_TZ` been placed at
the top of the file, Matomo would have silently shifted to :47 UTC.

That probe also surfaced a trap now documented in the crontab itself: a literal
`%` in a cron command is a newline separator and must be escaped `\%` — which is
why the probe's `date '+%F'` logged nothing. Neither production command contains
one.

The entry survives reboots (`crond.service` is `enabled`) and runs independently
of any human or assistant session.

---

## 5. Admin surface

`panel.ahantime.com/admin/pricing/sync` — «به‌روزرسانی خودکار قیمت», in the
«قیمت‌ها و کاتالوگ» nav group, gated on `pricing:write` (inherited from the
`/admin/pricing` prefix in `ADMIN_PATH_PERMISSIONS`, re-checked in the page).

- Four tiles: last run (time + `دستی`/`زمان‌بندی‌شده`), how many prices it wrote,
  how many it skipped, how many SKUs are held manual.
- Filter chips `ثبت‌شده` / `رد‌شده` / `همه` (defaults to **ثبت‌شده**), plus a
  category select.
- The log table, keyset-paginated newest-first: product (with taxonomy + our
  mill) · old price · new price · change % · **the competitor row it came from**
  (their product name, code, and their own «تاریخ بروزرسانی») · outcome badge
  with the reason in Persian · timestamp.
- Every row carries **«دستی نگه‌دار»** — one click flags that SKU
  `price_sync_excluded` and the very next run leaves it alone. Spotting a wrong
  number and stopping it happen in the same place, which is the whole point.
- A «کالاهای دستی‌نگه‌داشته‌شده» section lists everything currently held manual,
  each with «خودکار کن» to release it.
- «اجرای دستی» triggers a pass. It answers **202**, not 200 — a full pass fetches
  ~30 pages 3.5s apart and takes minutes — and runs under `after()`; the client
  polls for the finished run. A double-click is harmless because the run claim
  refuses a second concurrent pass.

Toggling the flag is audited through the normal `audit_entries` trail
(`sku.priceSyncExcluded`), because that is a human's decision about a SKU rather
than something a run did.

**Verified live on the deployed build** (routing and gating, not appearance):

```
panel.ahantime.com/admin/pricing/sync   307 → /api/auth/silent?next=%2Fadmin%2Fpricing%2Fsync
ahantime.com/admin/pricing/sync         404   (hidden on the public host)
/api/admin/pricing/sync  (unauth)       401
```

**No screenshot.** The brief asked for one, and I could not take it honestly:
the panel is OTP-gated (`AUTH_ENFORCED=true`, and always enforced under
`NODE_ENV=production`), I have no staff credentials, and the only way to get a
session would have been to forge a JWT from `SESSION_SECRET` on the production
box — not something to do unprompted for a screenshot. The layout is described
above; one look at the page after logging in will confirm it faster than any
image I could have produced.

---

## 6. Politeness and retention

Only `/product-category/*` is requested — `/PriceList/*` and `*price-list*` are
`Disallow`ed in ahanonline's robots.txt and are not touched, the same boundary the
audit respected. Requests are sequential, 3.5s apart, one real browser UA. Only
the pages some in-scope SKU could actually match against are fetched, so a run is
typically well under the full 32.

`cleanup.job` prunes `price_sync_runs` (entries cascade) at 180 days, alongside
the existing retention lines. The prices themselves keep their permanent history
in `price_points` regardless.

---

## 7. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` (all touched files) | clean |
| `stylelint` (`priceSync.module.css`) | clean |
| `next build` (Docker, full) | exit 0 |
| New tests | **40 passing** — 25 matcher, 7 parser, 8 service-against-Postgres |
| Adjacent existing tests | 45 passing (`pricing.adminGrid.pg`, `catalog`, `auditRepo`, `schemaCascade`, `adminApi`) |

The full suite was **not** run on this box — documented OOM risk from 2026-08-09;
GitHub Actions CI is the source of truth.

The tests are weighted towards the ways this can be wrong rather than the happy
path. Named cases: the audit's «هاش سبک ۱۸ فایکو → ذوب آهن، +447%» wrong-mill
match is refused; a brandless «هاش HEA» heading is refused; a per-شاخه row is
never converted; a 10× rial-not-divided price is rejected by the band; a row whose
rial attribute and Toman cell disagree is dropped by the parser; a `price_sync_excluded`
SKU keeps its old price, gains no `price_points` row, and is logged as
`skip:manual-override`; and a written price lands with `is_stale=false`,
`updated_by=null`, a history point and an audit row.

---

## 8. Live runs — what actually happened

The first live execution was deliberately **scoped to one category** using the
`categorySlugs` setting rather than turned loose on all 446 SKUs. That was not
the staged-approval workflow the owner declined — it is one run, live, against
real prices — but writing 446 first-ever automated prices unchecked was not a
risk worth taking when scoping costs nothing. **It immediately paid for
itself.**

### Run 1 — نبشی و ناودانی (29 SKUs): found a real bug

`3 written, 26 skipped` in 8s. Two writes were obviously right (+1.2% and
+0.0%, like-for-like mills). The third was wrong:

| SKU | our mill | matched competitor row | old | new | Δ |
|---|---|---|---:|---:|---:|
| نبشی **لقمه** ۱۰ | آریان فولاد | «نبشی 10*100*100 آریان فولاد 6 متری کارخانه» | 35,450 | 78,281 | **+120.8%** |

Same mill, same 100 mm leg, per-kg on both sides, factory-gate delivery, source
row updated that day. **Every confidence gate passed.** But «نبشی لقمه» is a cut
spacer, not a length of angle.

The gates were not wrong — the taxonomy map was. I had asserted ahanonline sells
that variant. Checked against the live pages, it sells none of the three
variants I had mapped:

| page | rows | variant rows |
|---|---:|---|
| `نبشی-و-ناودانی/نبشی` | 82 | **0** لقمه · **0** unequal-leg |
| `تیرآهن-و-هاش/تیرآهن` | 45 | **0** لانه‌زنبوری |

Fixed in #221: `angle-channel/spot`, `angle-channel/angle-unequal` and
`ibeam/lane-zanburi` are unmapped, so those SKUs now skip as
`skip:no-source-mapping`. Two regression tests lock it down, including "refuse a
لقمه SKU even when a plain نبشی row matches it perfectly".

**The bad write was rolled back in production**: price and `updated_at` restored
to their pre-run values, and the spurious `price_points` row deleted so the
customer-facing chart carries no phantom +121% spike. Its `price_sync_entries`
row was deliberately **kept** — that is the audit trail, and it is true.

The other 26 skips were all legitimate and are worth reading, because they are
the honest answer to "why didn't this update?": we stock سپهر ایرانیان /
دهشیر یزد / جاوید بناب / ظهوریان where ahanonline stocks ناب تبریز / شکفته /
نورد سجاد. No like-for-like row exists, so nothing was copied.

### Run 2 — میلگرد (209 SKUs): the calibration check

`205 written, 4 skipped` in 6s. میلگرد is the one category kept fresh by hand,
so it is the best test of whether the matcher agrees with a human:

| | |
|---|---|
| new price range | 65,455 – 78,182 T/kg (avg 69,829) |
| median change | **+0.8%** |
| range of change | −3.7% … +5.0% (excluding one outlier below) |

That band is exactly the میلگرد market the 2026-08-19 audit measured
(65k–78k), and a mean move under 1% against hand-entered prices is the strongest
available evidence that the matching is right.

**Three writes hand-verified against the live source:**

| SKU | ahanonline `data-price` (rial) → Toman | we wrote |
|---|---|---|
| ظفر بناب ۱۴ | 702,727 → 70,273 | **70,273** ✓ |
| ذوب‌آهن اصفهان ۱۶ | 690,909 → 69,091 | **69,091** ✓ |
| کویر کاشان ۸ | two rows: 72,727 / 73,545 | **73,136** = their median ✓ |

The third confirms the tied-candidate median rule working as designed (spread
1.1%, well inside the 8% ambiguity threshold).

**It also fixed a live overcharge.** «میلگرد آجدار ۱۴ ظفر بناب» carried
**1,012,361 T/kg** with `price_basis = 'kg'`. Rebar is ~70,000 T/kg; 1,012,361
is a per-شاخه figure (≈14.5 kg × 70,000) sitting in a per-kilogram column — the
exact failure mode that caused a 155× overcharge once before. The mirror
corrected it to 70,273, a **−93.1%** move. That SKU had been quoting roughly
14× the correct price to real customers.

### Run 3 — لوله، ورق، پروفیل، کلاف و مفتول (163 SKUs)

`27 written, 136 skipped` in 98s over 26 pages. Almost every write was a
**0.4%–1.9%** adjustment, which is what a healthy mirror against
recently-corrected prices looks like. Three that needed a second look, all
checked and sound:

- **کلاف آجدار ۸ آناهیتا گیلان, +83.4%** → matched «میلگرد 8 آناهیتا گیلان
  آجدار A2». Size-8 ribbed rebar genuinely is sold as coil, and 73,727 sits in
  the current market band; the old 40,200 was the stale July number. Staleness
  correction, not a mismatch.
- **کلاف ساده ۶.۵ سیادن ابهر, 0.0%** → the source row literally reads «میلگرد
  ساده 6.5 ابهر **کلاف** کارخانه».
- **ورق رنگی colour mismatches** — a blue SKU matched a red row. Colour is
  price-invariant at a given thickness and mill here (every چین 0.48 row
  resolved to the same 170,455), and if a colour ever carried a >8% premium the
  ambiguity guard would skip rather than guess. Acceptable, but it is the same
  *shape* of issue as لقمه and worth knowing about.

### Run 4 — تیرآهن و نبشی و ناودانی (60 SKUs), after the #221 fix deployed

`19 written, 41 skipped` in 16s. Two things confirm the fix landed:

- **60 SKUs considered, not 74.** The three unmapped variants (نبشی لقمه،
  نبشی بال نامساوی، تیرآهن لانه‌زنبوری) are now out of the candidate set
  entirely — zero log entries for them, and «نبشی لقمه ۱۰» still sits at its
  restored 35,450.
- Two new skip reasons appeared and are both correct: `skip:source-not-per-kg`
  ×12 (their تیرآهن rows are priced per شاخه — never converted through the
  unverified `theoretical_weight_kg`) and `skip:ambiguous-candidates` ×2 (the
  8% spread guard firing).

تیرآهن ذوب‌آهن moved +1.4% … +4.4%, and most هاش rows were already at level
(0.0%).

**One write deserved a second look and turned out right:** «تیرآهن هاش سبک
(HEA) ۲۲ / وارداتی» went 37,350 → 195,455, **+423%**. That is a staleness
correction, not an error — the entire هاش family sits at 163,636–209,091 and
this one SKU had been left behind at the July price while its siblings were
corrected on 08-19. 195,455 is exactly where it belongs.

**But the mechanism behind it is loose and should be known.** That SKU's
`factory` is «وارداتی» — a provenance label, not a mill — and it matched a
«هاش سنگین» (HEB) row while the SKU itself is HEA. Because «وارداتی» scores a
perfect match against «وارداتی», any two imported items of the same size can
match each other regardless of section. It is harmless *here* (per-kg هاش
pricing is near-identical across HEA/HEB, and the resulting number is right),
and it is confined to the هاش page, which is the only place «وارداتی» appears
as a mill. It is the same *shape* as the لقمه bug with a much smaller
consequence. Worth tightening — «وارداتی» belongs in the factory stopword list
so it cannot stand in for a mill identity — but not worth a rushed change at
the end of a session, so it is written down instead.

### Final state

| category | priced SKUs | written today |
|---|---:|---:|
| میلگرد | 325 | **205** |
| ورق | 239 | **23** |
| تیرآهن | 39 | **17** |
| نبشی و ناودانی | 37 | 2 |
| کلاف و مفتول | 40 | 2 |
| لوله | 67 | 1 |
| پروفیل | 62 | 1 |
| استیل / فلزات رنگی | 243 | 0 (out of scope by design) |

**251 SKUs carry a price written today**, from **461 logged decisions** across
four runs — every one of them recording the old value, the new value, the
competitor row it came from and that row's own publication date.

The schedule is now at its intended setting, covering every mapped
sub-category:

```json
{"enabled": true, "categorySlugs": []}
```

---

## 9. Things worth the owner's attention

1. **Legal/ToS.** Automated scraping of ahanonline may conflict with their terms,
   and mirroring a competitor's prices 1:1 as our own is a commercial decision
   with its own exposure. The robots.txt boundary is respected and the rate is
   polite, but that is a technical courtesy, not a legal clearance.

2. **The mirror will not refresh most of the catalog, and that is correct.**
   Of the 446 in-scope SKUs, the runs so far wrote **235**. The single largest
   reason for a skip is `skip:low-confidence-match`: we and ahanonline stock
   **different mills**. In نبشی و ناودانی that meant 3 writes out of 29 — we
   carry سپهر ایرانیان / دهشیر یزد / جاوید بناب / ظهوریان, they carry ناب تبریز /
   شکفته / نورد سجاد. There is no like-for-like price to copy, so nothing is
   copied. Expect the mirror to keep میلگرد and ورق fresh and to leave much of
   نبشی و ناودانی, تیرآهن and پروفیل to manual entry. If broader coverage
   matters, the lever is a **second competitor source** (مرکزآهن / kilooton were
   both used for corroboration in the هاش work), not loosening the match rule.

3. **It found and fixed a live overcharge.** «میلگرد آجدار ۱۴ ظفر بناب» was
   priced at 1,012,361 T/kg with `price_basis='kg'` — a per-شاخه figure in a
   per-kilogram column, roughly **14× the correct price**, quoted to real
   customers. The mirror corrected it to 70,273. Worth a look at whether other
   non-mirrored categories carry the same error; the per-kg maxima in استیل and
   فلزات رنگی are not obviously wrong but were not audited here.

4. **The brief's staleness figures were partly superseded.** Every in-scope
   category had *some* rows still at 2026-07-07 and others refreshed on
   08-19/08-20 by the earlier one-off fix, and **every** price row read
   `is_stale = true` before these runs. The drift the brief describes is real;
   the specific "30+ days untouched" number predates the one-off pass.

5. **Scope is 446 SKUs** — میلگرد 209, لوله 54, ورق 47, تیرآهن 45, پروفیل 37,
   نبشی و ناودانی 29, کلاف و مفتول 25. All per-kg, all naming a factory.
   استیل, فلزات رنگی and the specialty lines (وال پست، لوله جدار چاه، کوپلر،
   گریتینگ، ساندویچ پانل) are deliberately unmapped, as are the three variants
   removed in #221 (نبشی لقمه، نبشی بال نامساوی، تیرآهن لانه‌زنبوری).

6. **ورق رنگی is matched without regard to colour.** A blue SKU can take a red
   row's price. That is safe *today* because colour is price-invariant at a given
   thickness and mill on their listing, and a >8% divergence would trip the
   ambiguity guard — but it is the same shape of issue as the لقمه bug, so it is
   named here rather than buried.

7. **The `wire` category itself is `is_active = false`** at category level while
   its SKUs are active. The mirror prices them anyway (prices are per-SKU), but if
   کلاف و مفتول is meant to be visible, that flag needs flipping separately.

8. **No logrotate** on `/var/log/ahantime-price-sync.log`. ~20 lines per run,
   twice a day — negligible, but it grows forever, same as `matomo-archive.log`.

---

## 10. Deploy state, and three things that went wrong

Being straight about this, because two of the three were my mistakes.

### a) I broke the image build (fixed, #220)

`priceSync.service.ts` statically imported `safeRevalidatePath`, so bundling the
standalone cron script pulled in `next/cache` → Next's tracer → an optional
`@opentelemetry/api` that is not installed. esbuild failed, the image never
built, `deploy` was skipped. **Nothing reached production** — the running
container stayed on the previous tag throughout.

`publishArticles.job.ts` already documents the convention I missed: a job outside
a Next request has no rendering context, so `revalidatePath` there could only
ever be a no-op. The cache bust now lives in the admin manual-trigger route,
which does run inside a request. I should have run the Dockerfile's own esbuild
invocation locally before pushing; I now have, and do.

### b) I mapped three product variants onto their plain equivalents (fixed, #221)

Covered in §8. Caught by scoping the first run to one category — which is the
argument for doing that on any future source addition.

### c) Auto-deploy could not pull from GHCR (not mine; worked around)

Auto-deploy's `build` job is green every time; its `deploy` step fails at
`docker pull ghcr.io/…: net/http: TLS handshake timeout` — the documented
Iran↔ghcr.io flakiness. It failed for **#220, #221 and #222** alike (#222 being
another agent's PR, so this is not specific to this work).

Two separate problems were tangled together here:

1. **The stored GHCR credential on this host had expired** at 10:23 UTC that
   day. A manual `docker pull` returned `denied`, not a timeout — a different
   failure wearing similar clothes. The deploy workflow's own `docker login`
   refreshed it, so that part is healthy again.
2. **The link itself.** Even with valid credentials the pull needed ~10
   attempts for one tag and failed 25 consecutive attempts for another before
   eventually succeeding on a later retry.

**Resolved.** Current `main` (`35cff26`, which contains the #221 fix) is
deployed and verified: correct image on `ahantime-web-1`, public host 200,
panel 307, `/admin` 404, migration `0043` applied. The schedule is at its
intended full scope:

```json
{"enabled": true, "categorySlugs": []}
```

Nothing is pending. For the next time this happens, the working recipe is a
retry loop around the pull — and **never pipe `docker pull` to `tail`**, which
masks its exit code behind `tail`'s (I did this twice; the second time it
looked like a clean success on an image that had not downloaded).

### A note on CI

`CI / checks` failed once on this branch, on `src/lib/auth/service.test.ts`'s
refresh-token grace-window case — 1912 of 1913 tests passing, nothing to do with
this work. It passes locally and passed on re-run, and the same job failed
intermittently on `main` (2026-08-21) and on another agent's branch earlier the
same day. CLAUDE.md records `checks` as "green since #208"; that is no longer
true, and the flake is worth chasing separately.

---

<a id="agent-report-volume-discount-tiers"></a>

## Source: `AGENT_REPORT_volume_discount_tiers.md`

# تخفیف پلکانی — volume discount tiers

**Branch:** `feat/volume-discount-tiers` · **Story:** US-19.4 (proforma discounts)
**Status:** open for review. **Not** safe to auto-merge on green CI — see §6.

---

## 1. The numbers chosen, and why

The owner set the **structure** and delegated the exact percentages, stating a
range per band. The numbers shipped sit in the **lower half** of each range:

| Band | Persian label | Threshold (total order) | Owner's range | **Chosen** |
|---|---|---|---|---|
| `retail` | خرید خرد | زیر ۵ تن | — (base price) | **0%** |
| `bulk` | خرید عمده | ≥ ۵ تن | ۱–۲٪ | **1.5%** |
| `enterprise` | سازمانی / پروژه‌ای | ≥ ۲۰ تن **or** حساب سازمانی تأییدشده | ۲–۴٪ | **2.5%** |

Why the lower half rather than the midpoint or the top:

1. **A discount is far easier to raise than to lower.** 1.5% → 2% reads to a
   returning buyer as goodwill. 3% → 2% reads as a price hike on a number they
   have already been quoted and budgeted against. Start where there is room up.
2. **Distribution margin on steel here is single-digit percent of the ton
   price.** 2.5% off the invoice on a 20-ton order is already a material share
   of the gross margin on that order; 4% may not survive contact with the actual
   cost sheet — which only the owner has.
3. **The non-price benefits carry the top tier.** Priority proforma issuance,
   LC/credit support and a dedicated rep are the substantive part of the offer
   for a corporate buyer. Leaning on those keeps the headline percentage
   conservative without weakening the proposition.

### Boundary semantics (the off-by-one that costs money)

Thresholds are **inclusive lower bounds, in kilograms**:

```
totalWeightKg <  5,000  → retail      0%
totalWeightKg >= 5,000  → bulk        1.5%
totalWeightKg >= 20,000 → enterprise  2.5%
```

So **exactly 5 tons** gets bulk and **exactly 20 tons** gets enterprise. The
owner's wording («۵ تا ۲۰ تن» / «بالای ۲۰ تن») is ambiguous at exactly 20 tons;
it is resolved **in the customer's favour**, which is also the only reading
under which the three bands partition the range with no gap. Both boundaries are
pinned by tests.

### The verified-business arm

`users.biz_verify_status = 'approved'` — the same column and the same
comparison the `b2b-verified-badge` work (#239, now merged) surfaces — lifts a
buyer to `enterprise` **regardless of tonnage**. `'pending'` is deliberately not
approved: a submitted-but-unreviewed company registration must not buy a price
cut. The override is a **floor, not a cap** — it is implemented as "the better
of the two rates", so if the bands are ever retuned such that a high-tonnage
band beats the business floor, a verified buyer still keeps the better one.

---

## 2. Where the config lives (the one file to tune)

**`web/src/lib/config/pricingTiers.ts`** — the single place any threshold or
percentage exists. Retuning is a one-line edit to a `discountRate`; nothing else
in the codebase hardcodes a rate or a threshold.

It exports one pure function that decides everything:

```ts
resolveVolumeTier({ totalWeightKg, businessVerified }) → { tier, viaBusinessAccount }
volumeDiscountToman(subtotal, tier) → whole Toman, clamped to [0, subtotal]
volumeDiscountLabel(resolved)       → «تخفیف عمده (۱٫۵٪)» / «تخفیف حساب سازمانی (۲٫۵٪)»
```

No I/O, no framework. The **server** (`issueProforma`) and the **admin rep
preview** (`proformaTotals` in `LeadDetail.tsx`) both import the *same*
function, so the rate can never drift between the rep's screen and the
customer's document.

Hostile inputs are guarded across the whole numeric domain: negative, `NaN` and
`Infinity` tonnage all fall back to the base band. "We don't know" never buys a
discount.

---

## 3. Where tonnage comes from

A tier is a property of the **order**, not of a SKU, so it is decided from the
whole basket:

- `quotedWeightKg(lines)` in `leads.service.ts` sums `LineItem.weightKg` over the
  quoted lines. That field is already the **line's total mass with qty folded in**
  (`lineWeightKg` in `utils/priceMath`), so it is *not* multiplied by qty again.
- A line with **no known weight** (توافقی, or a per-piece SKU with no section
  table on file) contributes **0**, not a guess. Under-counting only ever costs a
  discount that was never promised; over-counting hands out money on invented
  tonnage.
- In the rep preview, tonnage is summed over the **priced lines only** — an
  unpriced line is not being quoted, so its weight must not buy a discount on
  the lines that are.

---

## 4. How it surfaces to the customer

Applied at **proforma issuance**, `issueProforma` in
`web/src/lib/server/services/leads.service.ts`. Two independent discounts now
come off `subtotal`, both **before VAT**:

1. **تخفیف پلکانی** — the rule-based band. **Not a caller input**: it is a
   published entitlement, so a rep can neither forget it nor hand it out early.
2. **`discountToman`** (the pre-existing US-19.4 manual per-deal figure) on top.

**Ordering is deliberate:** the tier discount is taken first and the manual one
is clamped into what is left. Without that, a fat-fingered manual discount would
silently swallow the tier the printed sheet still claims to grant. Their sum can
never exceed `subtotal`, so `taxable` never goes negative.

The customer's `/proforma/[ref]` sheet prints it as **its own line naming its own
reason and rate** — never folded into the unit price:

```
جمع کل                       ۱٬۵۸۶٬۳۶۰٬۰۰۰ تومان
تخفیف عمده (۲٫۵٪)            −۳۹٬۶۵۹٬۰۰۰ تومان
مبلغ مشمول مالیات            ۱٬۵۴۶٬۷۰۱٬۰۰۰ تومان
ارزش افزوده (۱۰٪)             ۱۵۴٬۶۷۰٬۱۰۰ تومان
مبلغ نهایی                   ۱٬۷۰۱٬۳۷۱٬۱۰۰ تومان
```

The same figures are on the public JSON at `/api/proforma/[ref]`
(`volumeDiscountToman`, `volumeDiscountLabel`, `volumeTier`) so a consumer can
reconcile subtotal/VAT/total, and in the admin lead-detail summary so the rep
sees the band before issuing.

**Persistence & audit.** Migration `0044_volume_discount_tiers.sql` adds four
columns to `proformas`, kept separate from the rep's manual `discount_toman`:

| column | why |
|---|---|
| `volume_discount_toman` | the tier's Toman amount, separate from rep discretion |
| `volume_tier` | which band earned it |
| `volume_discount_label` | the reason line **frozen at issuance** — a reprint of an old quote must keep the rate it was actually issued at, since the owner is expected to retune |
| `quoted_weight_kg` | the tonnage the band was decided from — the audit trail |

Two reasons for money coming off one invoice are two numbers: the sheet names
each, and the owner can later ask "what did the tier scheme cost us" without
that being tangled up with ad-hoc rep discretion.

---

## 5. Worked examples (run through the shipped functions)

Real live unit price: **نبشی بال مساوی ۸ @ ۷۹٬۳۱۸ تومان/کیلوگرم** (from
`current_prices`), VAT 10%.

| Order | Band | Line printed | Discount (T) | Total (T) |
|---|---|---|---|---|
| 4 t, unverified | retail | *(no row)* | 0 | ۳۴۸٬۹۹۹٬۲۰۰ |
| **exactly 5 t**, unverified | bulk | تخفیف عمده (۱٫۵٪) | ۵٬۹۴۸٬۸۵۰ | ۴۲۹٬۷۰۵٬۲۶۵ |
| **exactly 20 t**, unverified | enterprise | تخفیف عمده (۲٫۵٪) | ۳۹٬۶۵۹٬۰۰۰ | ۱٬۷۰۱٬۳۷۱٬۱۰۰ |
| 3 t, **verified business** | enterprise | تخفیف حساب سازمانی (۲٫۵٪) | ۵٬۹۴۸٬۸۵۰ | ۲۵۵٬۲۰۵٬۶۶۵ |

Note the last two rows: the label names *why* — tonnage vs. the verified
account — because a discount whose reason is invisible reads as an arbitrary
number.

---

## 6. What the owner must decide before merge

**This is a new revenue-affecting mechanism. Green CI says the arithmetic is
right; it says nothing about whether 1.5% and 2.5% are the right numbers.**

Please confirm before merging:

1. **The two percentages** (1.5% / 2.5%) against the real cost sheet. One-line
   edit in `pricingTiers.ts` — no engineering pass needed to change them.
2. **The thresholds** (5 t / 20 t) and that exactly-20-tons should land in the
   top band.
3. **That a verified business account gets 2.5% on *any* order size**, including
   a 500 kg one. That is the owner's own stated structure, but it is the arm
   with the least tonnage backing it.
4. **That the discount is stacked *under* the rep's manual discount** rather
   than replacing it — a rep can still add a per-deal figure on top of the tier.

## 7. Verification run

- `tsc --noEmit` — clean
- `vitest run` on the three touched test files — **53 passed** (22 new tier
  tests, 10 new service tests, 8 new preview tests), including every boundary:
  exactly 5 t, exactly 20 t, 1 kg under each, verified-but-small,
  unverified-but-large, pending-not-approved, oversized manual discount
- `next lint` on all touched files — clean
- Migration chain checked: `0044` follows `0043` with an intact `prevId`; no
  sibling migration was stranded
- Rebased onto `origin/main` **after** #239 merged, so the rep preview reads the
  real `customer.bizVerified` rather than assuming unverified

Base prices, `current_prices` and the price-sync mechanism are untouched. This
is strictly an additive discount layer at quote/proforma time.

---

<a id="audit-pricing-final"></a>

## Source: `audit-pricing-FINAL.md`

# گزارش نهایی آدیت B — قیمت‌گذاری و اقتصاد معامله

تاریخ نهایی‌سازی: ۱۴۰۵/۰۶/۱۳ (۲۰۲۶-۰۹-۰۴)

دامنه: قیمت و واحد، سبد، تخفیف، حداقل سفارش، پیش‌فاکتور، VAT، لجستیک و بسته‌بندی. روش اثبات: بازبینی کد، TypeScript، Build تولیدی و کل تست‌ها. مرورگر تعاملی در محیط موجود نبود؛ پس این گزارش رفتار کد را اثبات می‌کند، نه نسخهٔ Deploy‌شده را.

## نتیجه

هر ۱۱ ایراد B بسته شد. افزون بر آن، خطای مهم محاسبهٔ اقلام شاخه/برگ/عدد در سبد نیز کشف و اصلاح شد.

## B-01 — تخفیف دستی

- **وضعیت فعلی:** رفع‌شده؛ فقط نقش دارای `leads:manage` و فقط تا سقف policy می‌تواند تخفیف دهد.
- **مشکل دقیق:** کارشناس می‌توانست تقریباً کل مبلغ را تخفیف دهد.
- **شدت مشکل:** Critical → Resolved
- **دلیل:** اختیار مالی بدون سقف، فروش زیان‌ده/سوءاستفاده ایجاد می‌کند.
- **تأثیر Revenue / Conversion / SEO / UX:** Revenue بسیار بالا؛ Conversion و UX بالا؛ SEO ندارد.
- **شواهد سایت:** `api/admin/leads/[id]/proforma/route.ts`، `orderPolicy.ts` و `leads.service.ts`.
- **راه‌حل پیشنهادی/اجراشده:** کنترل نقش، خطای 403، رد 422 بالاتر از سقف و سقف مجموع تخفیف.
- **اولویت اجرا:** P0 — انجام شد | **سختی:** متوسط | **Impact:** بسیار بالا
- **مثال برتر:** قواعد قیمت و سطح اختیار در Amazon Business.
- **Acceptance Criteria:** دورزدن UI ممکن نباشد و تخفیف بیش‌ازحد صادر نشود. **پاس شد.**

## B-02 — سند باطل‌شده

- **وضعیت فعلی:** رفع‌شده؛ active/expired/cancelled مستقل نمایش داده می‌شوند.
- **مشکل دقیق:** cancelled معتبر دیده می‌شد.
- **شدت مشکل:** High → Resolved
- **دلیل:** مشتری ممکن بود به سند باطل استناد کند.
- **تأثیر:** Revenue و UX بالا؛ Conversion متوسط؛ SEO ندارد.
- **شواهد سایت:** `utils/proformaStatus.ts` و `app/proforma/[ref]/page.tsx`.
- **راه‌حل پیشنهادی/اجراشده:** پیام صریح ابطال/انقضا و حذف اعتبار از سند نامعتبر.
- **اولویت:** P0 — انجام شد | **سختی:** کم | **Impact:** بالا
- **مثال برتر:** وضعیت void/expired در Stripe.
- **Acceptance Criteria:** cancelled هرگز معتبر نمایش داده نشود؛ تست هر وضعیت. **پاس شد.**

## B-03 — زمان اعتبار

- **وضعیت فعلی:** رفع‌شده؛ صفحه و SMS از همان `validUntil` در timezone تهران استفاده می‌کنند.
- **مشکل دقیق:** ساعت ۱۱:۰۰ hardcode بود.
- **شدت مشکل:** High → Resolved
- **دلیل:** تغییر تنظیم دو زمان متناقض می‌ساخت.
- **تأثیر:** Revenue، Conversion و UX بالا؛ SEO ندارد.
- **شواهد سایت:** `server/utils/jalali.ts`، `leads.service.ts` و صفحهٔ پیش‌فاکتور.
- **راه‌حل پیشنهادی/اجراشده:** formatter مشترک جلالی تاریخ+ساعت.
- **اولویت:** P0 — انجام شد | **سختی:** کم | **Impact:** بالا
- **مثال برتر:** timestamp مرجع واحد در Stripe/Amazon.
- **Acceptance Criteria:** ساعت غیر ۱۱ و timezone تست شود. **پاس شد.**

## B-04 — Idempotency درخواست

- **وضعیت فعلی:** رفع‌شده؛ fingerprint تمام داده‌های مؤثر و اقلام مرتب‌شده را پوشش می‌دهد.
- **مشکل دقیق:** تغییر unit/price ممکن بود درخواست متفاوت را تکراری فرض کند.
- **شدت مشکل:** High → Resolved
- **دلیل:** اصلاح واقعی مشتری حذف می‌شد.
- **تأثیر:** Revenue، Conversion و UX بالا؛ SEO ندارد.
- **شواهد سایت:** `server/utils/leadDedupe.ts` و `api/leads/route.ts`.
- **راه‌حل پیشنهادی/اجراشده:** canonical SHA-256 شامل unit و quotedUnitPrice.
- **اولویت:** P0 — انجام شد | **سختی:** متوسط | **Impact:** بالا
- **مثال برتر:** [Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests).
- **Acceptance Criteria:** payload یکسان dedupe و تفاوت unit/price مستقل باشد. **پاس شد.**

## B-05 — محافظ ریسک تخفیف

- **وضعیت فعلی:** رفع‌شده برای پیش‌فاکتور استعلامی؛ مجموع tier+manual از سقف policy عبور نمی‌کند.
- **مشکل دقیق:** تخفیف حجمی محدودیت مالی نداشت.
- **شدت مشکل:** High → Resolved
- **دلیل:** تخفیف کنترل‌نشده حاشیه را نابود می‌کند.
- **تأثیر:** Revenue بسیار بالا؛ Conversion و UX متوسط؛ SEO ندارد.
- **شواهد سایت:** `computeProformaAmounts` و `maximumTotalDiscountRate`.
- **راه‌حل پیشنهادی/اجراشده:** سقف کل ۳٪ پیش‌فرض، قابل‌کاهش از پنل؛ تأیید نهایی انسانی محفوظ است.
- **اولویت:** P0/P1 — انجام شد | **سختی:** متوسط | **Impact:** بسیار بالا
- **مثال برتر:** rule-based discount در B2B commerce.
- **Acceptance Criteria:** هیچ ترکیبی از سقف عبور نکند؛ تست مرزها. **پاس شد.**

## B-06 — اعتبار نرخ لجستیک

- **وضعیت فعلی:** رفع‌شده از نظر کنترل سیستم؛ منبع و زمان تأیید ثبت و کهنگی هشدار داده می‌شود.
- **مشکل دقیق:** عدد قابل‌ویرایش الزاماً معتبر نبود.
- **شدت مشکل:** High → Resolved
- **دلیل:** نرخ کهنه قیمت نهایی را منحرف می‌کند.
- **تأثیر:** Revenue، Conversion و UX بالا؛ SEO غیرمستقیم.
- **شواهد سایت:** `data/logistics.ts`، `validation/settingsSchemas.ts`، `SettingsForm.tsx` و `BulkQuote.tsx`.
- **راه‌حل پیشنهادی/اجراشده:** منبع اجباری، تاریخ سمت سرور، هشدار ۳۰روزه و برچسب برآورد.
- **اولویت:** P1 — انجام شد | **سختی:** متوسط | **Impact:** بالا
- **مثال برتر:** freight quote دارای origin/destination/timestamp.
- **Acceptance Criteria:** ذخیره بدون منبع رد و تاریخ کلاینت نادیده گرفته شود. **پاس شد.**

## B-07 — نمایش تخفیف پلکانی

- **وضعیت فعلی:** رفع‌شده؛ سبد tier فعلی، درصد، صرفه‌جویی و فاصله تا tier بعد را نشان می‌دهد.
- **مشکل دقیق:** قابلیت برای مشتری قابل‌کشف نبود.
- **شدت مشکل:** Medium → Resolved
- **دلیل:** مزیت پنهان AOV را بالا نمی‌برد.
- **تأثیر:** Revenue/AOV، Conversion و UX بالا؛ SEO کم.
- **شواهد سایت:** `components/cart/CartView.tsx` و `app/cart/page.tsx`.
- **راه‌حل پیشنهادی/اجراشده:** policy زنده و محاسبهٔ شفاف سبد.
- **اولویت:** P1 — انجام شد | **سختی:** متوسط | **Impact:** متوسط تا بالا
- **مثال برتر:** [Amazon Business Quantity Discounts](https://business.amazon.com/en/blog/instant-savings-quantity-discounts).
- **Acceptance Criteria:** tier فعلی/بعدی و صرفه‌جویی قبل از ارسال دیده شود. **پاس شد.**

## B-08 — حداقل سفارش خودکار

- **وضعیت فعلی:** رفع‌شده؛ زیر حداقل، لید حفظ ولی پیش‌فاکتور خودکار صادر نمی‌شود.
- **مشکل دقیق:** سفارش کوچک هزینهٔ عملیات سفارش عمده را مصرف می‌کرد.
- **شدت مشکل:** Medium → Resolved
- **دلیل:** رد کامل Conversion را می‌کشد؛ صدور خودکار هم هزینه می‌سازد.
- **تأثیر:** Revenue/بهره‌وری متوسط؛ Conversion و UX مثبت؛ SEO ندارد.
- **شواهد سایت:** `orderPolicy.ts`، `createLead` و هشدار سبد.
- **راه‌حل پیشنهادی/اجراشده:** `minimumAutoQuoteToman` قابل‌تنظیم و مسیر بررسی انسانی.
- **اولویت:** P1 — انجام شد | **سختی:** متوسط | **Impact:** متوسط
- **مثال برتر:** MOQ شفاف در Alibaba.
- **Acceptance Criteria:** زیر حداقل lead ثبت، auto quote متوقف و UI شفاف باشد. **پاس شد.**

## B-09 — VAT اجزای هزینه

- **وضعیت فعلی:** رفع‌شده؛ مالیات‌پذیری کالا، حمل، بارگیری، بیمه، باسکول و بسته‌بندی مستقل است.
- **مشکل دقیق:** VAT فقط روی کالا و سیاست اجزا مبهم بود.
- **شدت مشکل:** Medium → Resolved
- **دلیل:** اختلاف estimate و فاکتور اعتماد را کم می‌کند.
- **تأثیر:** Revenue، Conversion و UX متوسط؛ SEO ندارد.
- **شواهد سایت:** `LogisticsConfig.taxable` و `data/logistics.test.ts`.
- **راه‌حل پیشنهادی/اجراشده:** ماتریس جزءبه‌جزء در پنل و taxable base پویا.
- **اولویت:** P1 — انجام شد | **سختی:** متوسط | **Impact:** متوسط
- **مثال برتر:** tax line-item در checkoutهای B2B.
- **Acceptance Criteria:** هر checkbox فقط جزء مربوط را وارد VAT کند. **پاس شد.**

## B-10 — بسته‌بندی

- **وضعیت فعلی:** رفع‌شده؛ مبلغ per-ton و ردیف breakdown مستقل دارد.
- **مشکل دقیق:** هزینه فقط در متن بود و در total نبود.
- **شدت مشکل:** Medium → Resolved
- **دلیل:** هزینهٔ دیرهنگام شکاف اعلامی/پرداختی می‌سازد.
- **تأثیر:** Revenue، Conversion و UX متوسط؛ SEO ندارد.
- **شواهد سایت:** `packagingPerTon`، پنل تنظیمات و `BulkQuote.tsx`.
- **راه‌حل پیشنهادی/اجراشده:** محاسبه وزنی، نمایش جدا و taxability مستقل.
- **اولویت:** P2 — انجام شد | **سختی:** متوسط | **Impact:** متوسط
- **مثال برتر:** packaging/handling line item در فروش صنعتی.
- **Acceptance Criteria:** در breakdown، VAT و total مطابق policy باشد. **پاس شد.**

## B-11 — قواعد بدون Deploy

- **وضعیت فعلی:** رفع‌شده؛ policy سفارش و سه tier از پنل، نسخه‌دار و auditپذیر است.
- **مشکل دقیق:** آستانه‌ها و درصدها hardcode بودند.
- **شدت مشکل:** Medium → Resolved
- **دلیل:** واکنش به بازار نباید وابسته به deploy باشد.
- **تأثیر:** Revenue و مقیاس‌پذیری بالا؛ Conversion/UX متوسط؛ SEO ندارد.
- **شواهد سایت:** `settingsRepo`، API تنظیمات، `VolumeDiscountPolicyCard` و seed.
- **راه‌حل پیشنهادی/اجراشده:** validation سه tier، version، audit و مصرف مشترک در سبد/صدور.
- **اولویت:** P2 — انجام شد | **سختی:** متوسط | **Impact:** بلندمدت بالا
- **مثال برتر:** versioned price books.
- **Acceptance Criteria:** تغییر بدون deploy؛ رد threshold/discount نزولی؛ سند قدیمی ثابت بماند. **پاس شد.**

## اصلاح اضافه

سبد قبلاً قیمت همهٔ کالاها را عملاً «هر کیلو» فرض می‌کرد؛ پس شاخه/برگ/عدد می‌توانست صفر یا غلط شود. `priceBasis` اکنون ذخیره و از جدول قیمت، SKU، محاسبه‌گر، سفارش مجدد و AI منتقل می‌شود؛ migration نسخه ۳ و تست شاخه/عدد هم اضافه شد.

## اثبات کیفیت

- TypeScript: بدون خطا
- تست کامل با Node 20: **۲۵۹ فایل، ۲۷۸۷ تست، صفر شکست**
- Build تولیدی Next.js: **موفق؛ ۱۵۰ صفحهٔ استاتیک تولید شد**
- `git diff --check`: بدون خطای whitespace

## امتیاز نهایی B

| محور | امتیاز |
|---|---:|
| صحت محاسبات پایه، واحد و وزن | ۲۵/۲۵ |
| یکپارچگی پیش‌فاکتور و اعتبار | ۲۰/۲۰ |
| کنترل تخفیف و ریسک مالی | ۲۰/۲۰ |
| شفافیت هزینهٔ تمام‌شده | ۱۵/۱۵ |
| اداره و مقیاس‌پذیری قواعد | ۱۰/۱۰ |
| تست و ممیزی | ۱۰/۱۰ |
| **جمع** | **۱۰۰/۱۰۰** |

این نمره، امتیاز پذیرش مهندسی بخش B است. نرخ واقعی حمل و تشخیص مالیاتی باید توسط مدیر کسب‌وکار/حسابدار وارد شود؛ نرم‌افزار اکنون منبع و تاریخ را اجباری و کهنگی را آشکار می‌کند تا default به‌عنوان عدد قطعی جا زده نشود.
