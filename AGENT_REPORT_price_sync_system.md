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
