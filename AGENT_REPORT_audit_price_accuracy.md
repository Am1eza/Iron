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
