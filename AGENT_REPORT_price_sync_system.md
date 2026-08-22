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

## 8. Live run

*(filled in below after deploy)*

---

## 9. Things worth the owner's attention

1. **Legal/ToS.** Automated scraping of ahanonline may conflict with their terms,
   and mirroring a competitor's prices 1:1 as our own is a commercial decision
   with its own exposure. The robots.txt boundary is respected and the rate is
   polite, but that is a technical courtesy, not a legal clearance.
2. **The brief's staleness figures are now partly superseded.** As of tonight
   every in-scope category has *some* rows still at 2026-07-07 and others
   refreshed on 08-19/08-20 by the earlier one-off fix — and **every** price row
   in the catalog currently reads `is_stale = true` (nothing was updated today).
   The drift the brief describes is real; the specific "30+ days untouched"
   number predates the one-off pass.
3. **Scope is 446 SKUs** (میلگرد 209, لوله 54, ورق 47, تیرآهن 45, پروفیل 37,
   کلاف و مفتول 25, نبشی و ناودانی 29). All are per-kg and all name a factory, so
   none is lost to those two gates. استیل, فلزات رنگی and the specialty lines
   (وال پست، لوله جدار چاه، کوپلر، گریتینگ، ساندویچ پانل) are deliberately out of
   scope — ahanonline publishes no like-for-like price for them.
4. **The `wire` category itself is `is_active = false`** at category level while
   its SKUs are active. The mirror prices them anyway (prices are per-SKU), but if
   کلاف و مفتول is meant to be visible, that flag needs flipping separately.
5. **No logrotate** on `/var/log/ahantime-price-sync.log`. ~20 lines per run,
   twice a day — negligible, but it grows forever, same as `matomo-archive.log`.
