# AGENT_REPORT — production DB integrity audit follow-up

**Date** 2026-08-23 (1405/06/01) · **Base** `main@2a00c0f` · **DB** `ahantime-db-1` / `ahantime`

Six issues were handed over as leads from a manual audit of the live database. Each was
investigated against production data, `audit_entries`, `price_sync_entries`, git history and —
where the claim was about what a customer sees — live HTTPS requests through Caddy.

**Three were real. Three were not**, and two of those would have caused damage if acted on as
written. The one issue the brief did *not* name turned out to be the most valuable finding in
the set.

| # | Lead as filed | Verdict | Outcome |
|---|---|---|---|
| 1 | `is_stale` broken across the whole table | **Not a bug** | Documented; no change |
| 2 | 7 active SKUs with no price → "fix the matcher" | **Real, but the matcher is right** | PR #230 — surface it, do not guess a price |
| 3 | 338 active SKUs under an inactive sub-category | **Real, already surfaced, owner-directed** | Documented + flagged to owner; no change |
| 4 | 22 redirect double-hops | **Real — and 57 rows land on a 404** | PR #229 + production data repair |
| 5 | `market_values` 7600:1 dead tuples | **Real — root cause found** | Fixed on the host; guard added |
| 6 | 15 never-scanned indexes | **Largely not a bug** | Documented; nothing dropped |

---

## 1. `is_stale` — investigated, no fix needed

**Claim.** 1133/1133 rows are `is_stale = true` and 1132/1133 have `updated_by = NULL`,
"including rows with `updated_at` from earlier today", so either the recompute job or the
price-sync write path must be broken.

**What is actually true.** Both numbers are correct and both are correct *behaviour*.

`is_stale` means "not repriced within the current **Jalali** day in Tehran", not the current
Gregorian day. At the time of the audit:

```
now                    2026-08-23 03:53 UTC  =  07:23 Tehran, 1405/06/01
last price write       2026-08-22 20:14 UTC  =  23:44 Tehran, 1405/05/31
```

The Jalali day rolled over at 20:30 UTC. Every price in the table was written **before** that
boundary, so every row is genuinely stale. Grouped by Tehran day, the whole table is
251 rows on 08-22, 723 on 08-20 and 159 on 07-07 — nothing was written today at all.
The reading "rows updated earlier today" comes from comparing against the Gregorian date.

I checked the two mechanisms the lead suspected and neither misbehaves:

- `recomputeStaleness()` (`pricing.service.ts:230`) selects only `is_stale = false` rows and
  flags those failing `isSameJalaliDay`. It cannot flag a row written today. `jalali.ts` is
  explicitly timezone-independent (fixed UTC+03:30, no DST since 2022) and does not read the
  server clock's zone — the containers run UTC and it still computes Tehran days correctly.
- `priceSync.service.ts` does **not** bypass `savePrice`; it calls `savePrices` (line 34/232),
  which sets `isStale: false` on both the insert and the `onConflictDoUpdate` branch.

`updated_by = NULL` is likewise correct and deliberate: the mirror is a system job and passes a
`null` actor, which `savePrice` documents. `audit_entries` agrees — 254 `price.update` rows with
a null actor, one with a human actor, matching the 1132/1 split exactly.

**Worth knowing:** the `current_prices.is_stale` column is *not* what the site or the panel
reads. Every display path computes freshness live through `priceFreshness.ts`, and
`/api/admin/stats` was deliberately moved off the column (see its W23 comment) so the dashboard
tile and the grid filter can never disagree. The column survives for `alertsRepo` and `aiTools`.

A one-off `UPDATE` here would have written the wrong answer into a column that is mostly
vestigial. **No change made.**

> The real signal in this data is different and is a business matter, not a bug: **723 prices
> have not been touched since 2026-08-20 and 159 since 2026-07-07.** That is the number worth
> putting in front of the owner.

---

## 2. Seven active SKUs with no price — real, but the matcher is right

**The seven** (all `is_active`, all under an active sub-category and category):

| SKU | created |
|---|---|
| میلگرد آجدار ۱۲ آناهیتا گیلان | 2026-08-16 |
| تیرآهن ۱۶ / ۲۰ / ۲۲ / ۲۴ فایکو | 2026-08-18 |
| تیرآهن ۱۶ اهواز | 2026-08-18 |
| تیرآهن ۱۶ ظفر بناب | 2026-08-18 |

**They are not invisible and not broken.** `tableRows` left-joins `current_prices`, so each one
ships as «تماس بگیرید». Verified live: `/prices/ibeam/tirahan` → 200, listing «تیرآهن ۱۶ فایکو»
with «تماس بگیرید». For a lead-gen site whose whole premise is "call us", that is a defensible
state — which is exactly why nothing ever raised it.

**The gap is narrower than it first looks, and worth stating precisely.** `CatalogManager` already
badges each such row «بدون قیمت» (`CatalogManager.tsx:693`), and `admin-pricing-catalog.spec.ts:269`
asserts that badge — its comment even calls it "the only signal that tells an owner there is
data-entry work outstanding". So the fact is *recorded*. What is missing is any way to notice it
**while doing the pricing**: the badge is legible one row at a time, on a page the daily routine
never opens; there is no count anywhere; `stalePrices` cannot see these rows (it counts
`current_prices`, the table they are absent from); the pricing grid lists them as a blank cell
indistinguishable from a stale-HIDDEN price; and the dashboard says nothing at all.

**The brief's hypothesis — that `priceSync.match.ts` is failing to match new تیرآهن variants and
should be fixed — is wrong, and fixing the matcher would have been a pricing incident.**
`price_sync_entries` has an entry for all seven, every one `skip:low-confidence-match`, and the
`matched_name` column shows why:

```
تیرآهن ۱۶ فایکو      ← «تیرآهن ذوب آهن 16 بنگاه اصفهان شاخه 12 متری»
تیرآهن ۱۶ اهواز      ← «تیرآهن ذوب آهن 16 بنگاه اصفهان شاخه 12 متری»
تیرآهن ۱۶ ظفر بناب   ← «تیرآهن ذوب آهن 16 بنگاه اصفهان شاخه 12 متری»
میلگرد ۱۲ آناهیتا    ← «میلگرد 12 ذوب آهن اصفهان آجدار A3 کارخانه»
```

The only size-compatible source row is a **different mill** — and the same one for three of our
SKUs. Relaxing the matcher to accept it would stamp ذوب آهن's price onto فایکو, اهواز and ظفر بناب
products simultaneously. `priceSync.match.ts`'s own header documents this as the reason only
`exact` is ever written, citing the هاش case where an `uncertain` match would have put a 4× price
on a real product. The matcher is doing its job.

So this is a **data-entry gap for the owner**, not something code can close.

**PR #230** adds the safety net the brief asked for, on the "admin-panel warning" side rather
than a nightly job (nothing here needs to run on a schedule — the number is one indexed query):

- `listActiveSkuIdsWithoutPrice()` — active SKU under an active sub and category with no price
  row. Taxonomy-stranded SKUs are deliberately excluded: they have their own tile and their own
  fix, and counting them here would send the operator to a grid that cannot show them.
- A dashboard tile «کالای بدون قیمت», marked **urgent** where «قیمت کهنه» is not — a stale price
  is still a number a customer can act on; an unpriced product never had one.
- A grid filter and warning behind `?unpriced=1`.

Returned as **ids, not a count**: in the admin DTO an absent price and a stale-HIDDEN price both
render as a blank cell, so the grid cannot tell them apart on its own.

**→ Owner action required: price these seven, or retire them.**

---

## 3. 338 active SKUs under an inactive sub-category — investigated, no fix

**The claim is understated** — the number is right, and every one of the 338 is *fully priced*:

| category | sub-category | active SKUs | priced |
|---|---|---|---|
| sheet | تسمه (`strip`) | 93 | 93 |
| rebar | کوپلر میلگرد (`coupler`) | 65 | 65 |
| sheet | ورق استیل (`steel`) | 47 | 47 |
| sheet | رنگی (`colored`) | 15 | 15 |
| profile | چهارپهلو | 14 | 14 |
| … | 19 more sub-categories | 104 | 104 |

**Is it producing a broken customer experience? No — checked at every surface.**

| surface | behaviour | verified how |
|---|---|---|
| `/prices/[cat]/[sub]` | 404 | `curl` — `/prices/sheet/strip` 404 |
| `/prices/[cat]/[sub]/[sku]` | 404 | `curl` — `/prices/ibeam/light/ibeam-light-5` 404 |
| category page | omits them | `catalogRepo` filters `subCategories.isActive` at lines 198/218/256/310/366/421/469/479 |
| site search | omits them | `/api/search?q=تسمه ماشینکاری` → 0 results, and `catalogRepo:803` filters |
| sitemap | omits them | PR #227's crawl: 1,226/1,226 × 200 |
| breadcrumbs / JSON-LD | consistent (nothing advertises them) | PR #226 |

Everything agrees. There is no inconsistent state — the products are uniformly invisible.

**Is it accidental? No.** `audit_entries` shows the owner (`01KWZ1SQ92H8ZBYNTG4SK1FE4Q`) doing
this by hand in the panel over about 80 minutes on 2026-08-21, interleaved with *creating* the
replacement structure — `prvfyl-sakhtmany`, `prvfyl-snaty`, `navdany-ayrany`, `navdany-arvpayy`,
`prvfyl-astyl`, then `vrgh-st52` and `vrgh-a516` the next afternoon. In the middle of it they
deactivated `pickled` and `galvanized` at 22:33–22:34 and **re-activated both at 22:36**. That is
someone curating, not a script misfiring. It is the ورق half of the same "rebuild on ahanonline's
model" that produced PR #224.

**And the panel already says so.** `countSkusHiddenByTaxonomy()` exists precisely for this, is
surfaced in `/api/admin/pricing`, and the pricing grid renders both a warning banner and a
dedicated empty state («۴۰ کالای این دسته روی سایت دیده نمی‌شود») instead of claiming the category
is empty.

**No data or code change.** Reactivating 24 sub-categories the owner deactivated by hand three
days ago would be overriding a live business decision. **Flagged for the owner instead**: 338
priced products are currently unsellable through the site. If the ورق rebuild is finished, they
need re-parenting into the new sub-categories; if it is still in progress, this is expected.

---

## 4. Redirects — real, and worse than filed · **PR #229**

The 22 double-hops are real. Following them to their destinations turned up the part the audit
did not reach: **57 of 177 `/prices` redirects land on a 404.** Confirmed by fetching every one,
not inferred from the schema.

```
/prices/vrgh-grm/tsmh → 308 → /prices/varagh-garm/tasme → 308 → /prices/sheet/strip → 404
```

The two are one problem: **eight of the 22 chains end at a 404**, so collapsing them alone would
only have produced a tidier route to nowhere.

**Three causes, all checked:**

1. the ورق/استیل re-slug of 2026-08-04 folded `varagh-garm`/`varagh-sard`/`varagh-steel`/`astyl`
   into `sheet`/`steel`, then the intermediate categories were deleted;
2. the owner's ورق restructuring of 2026-08-21 (issue #3 above) — 8 destinations are
   sub-categories that were deliberately hidden;
3. 24 rows point at SKUs since retired (`ibeam-ipe-1` «تیرآهن IPE ۲۰» and friends are still in
   `skus` with `is_active = false`).

**The guard PR #227 used was applied**: no `from_path` in the table is a live page (checked — 0
rows), and the script aborts rather than collapsing if one ever is. All 22 intermediate hops are
dead paths, so nothing live is being skipped past.

`web/scripts/repairRedirectTargets.ts` resolves each chain, then walks up to the nearest live
ancestor **only when** the terminal is dead. Applied to production, 60 rows updated:

| | before | after |
|---|---|---|
| single 308 → 200 | 105 | **184 / 184** |
| two hops | 22 | 0 |
| lands on 404 | 57 | 0 |

A second run reports "Nothing to do." Pre-change state saved to
`.claude/audits/redirects-before-db-integrity-20260823.csv`.

**Root cause fixed in the write path.** None of these chains was created by typing a chain in —
they grew *backwards*: `/prices/vrgh-grm → /prices/varagh-garm` was a fine single hop until
`/prices/varagh-garm → /prices/sheet` was added nine days later. `createRedirect`/`updateRedirect`
now store where a destination actually lands *and* re-aim every row pointing at the path being
claimed, keeping the table one hop deep from both directions. That also makes a cycle
unconstructible; `wouldLoop` still runs first for the direct self-redirect it cannot catch.

---

## 5. Dead tuples — root cause found and fixed

`market_values` held **38,182 dead tuples against 5 live rows** (7,600:1, 3.9 MB for a table read
on every page render). Autovacuum had run 10,778 times and was removing nothing.

**It was not the write pattern.** `marketRepo.upsertMarketValue` is a plain UPDATE, and 57,508 of
59,527 updates were HOT — the churn is normal ticker traffic and would have been reclaimed fine.

**It was a leaked transaction pinning the vacuum horizon:**

```
pid 561930 · idle in transaction · 6 days 22:37 · backend_xid 118504
client 172.18.0.13 · INSERT INTO market_points (id, key, value, at) VALUES ($1,'billet',$2,…)
```

`172.18.0.13` is `unruffled_einstein`, a stray ad-hoc `node:20` container left over from a
previous agent session running `scripts/backfillBilletHistory.ts --apply`. It hung mid-transaction
on 2026-08-16 and had been holding xmin at 118504 ever since, against a current txid of 165993 —
**47,000 transactions' worth of dead rows across the whole database that autovacuum could not
touch.** That is why `market_points` (66%) and `current_prices` (60%) showed the same symptom:
one cause, three tables.

**Safe to kill, and checked before doing so.** The backfill's *intended* result is already
committed — `market_points` holds all 10 billet points and `market_values.billet` = 60,800, both
written at 04:57:49 by a second, successful run 54 seconds later. The stuck transaction was a
first, hung attempt whose 10 inserts were never visible. Rolling it back preserved current state
and, incidentally, prevented 10 duplicate points had it ever committed.

Actions taken on the host:

1. `pg_terminate_backend(561930)` and `docker stop unruffled_einstein`;
2. `VACUUM (ANALYZE)` on the three tables — all dead tuples reclaimed;
3. `VACUUM FULL market_values` — **3,920 kB → 8 kB** (490 pages → 1 for a 5-row table that the
   ticker seq-scans on every render);
4. `ALTER DATABASE ahantime SET idle_in_transaction_session_timeout = '15min'` so a leaked
   transaction can never pin the horizon for a week again. Safe: every app transaction is
   sub-second, and the timeout only fires on sessions *idle* inside a transaction — an active
   migration is untouched.

Site verified 200 throughout. **No autovacuum tuning was needed** — with 5 live rows the
threshold is already ~51 dead tuples, which is why it was firing 10,778 times; it was never the
problem.

| table | dead before | dead after | size before | size after |
|---|---|---|---|---|
| `market_values` | 38,182 | 0 | 3,920 kB | **8 kB** |
| `market_points` | 5,828 | 0 | 736 kB | 736 kB |
| `current_prices` | 1,697 | 0 | 336 kB | 336 kB |

> The `ALTER DATABASE` is host state, not repo state. It persists in the data volume across
> restarts. Recorded here because nothing in `docker-compose.yml` shows it.

**Note for whoever runs one-off scripts:** the stuck process was still alive with a live esbuild
child, so `docker ps` showed a healthy container. It is worth checking
`pg_stat_activity WHERE state = 'idle in transaction'` after any `--apply` script run.

---

## 6. Never-scanned indexes — investigated, mostly not a bug

The lead's specifics do not survive checking. There are **95** zero-scan indexes, not 15 — and
the three named trigram indexes are not all unused:

```
articles_title_trgm_idx      idx_scan = 1
articles_excerpt_trgm_idx    idx_scan = 1
articles_body_trgm_idx       idx_scan = 0
skus_name_trgm_idx           idx_scan = 2
skus_factory_trgm_idx        idx_scan = 1
```

So **the articles search feature exists and does hit its indexes.** `articlesRepo.ts:342` — the
public search — `ilike`s `title` and `excerpt` only, which is exactly the two that show scans.
`bodyMd` is only reached by the AI advisor's `searchGuides` (line 418) and admin search (line
477), both rare, which is why `articles_body_trgm_idx` is at zero. Nothing is mis-wired; the site
simply has very little search traffic (`pg_stat_database.stats_reset` is null, so these counters
run from the DB's creation).

Of the remaining 92, the overwhelming majority are 8–16 kB — the size of an index on an empty or
near-empty table (`warehouse_settlements`, `club_memberships`, `search_console_metrics`,
`comment_helpful_votes`). An index on a table with no rows cannot be scanned. Several are primary
keys and unique constraints, which are not droppable without dropping the constraint.

Only `articles_body_trgm_idx` (1,504 kB) is both non-trivial in size and genuinely unused, and it
backs two real code paths that will use it the first time either runs.

**Nothing dropped. No code change** — the brief's condition ("only fix code if you find query
code that should be using an index and isn't") is not met.

---

## Verification summary

| check | result |
|---|---|
| all 184 redirects crawled | 184 × single 308 → 200 |
| `repairRedirectTargets.ts` re-run | "Nothing to do" (idempotent) |
| `tsc --noEmit` | clean, both branches |
| `next lint` on every changed file | clean (one pre-existing `_catOrder` warning) |
| `redirectsRepo.test.ts` | 21 passed |
| `catalogUnpriced.pg.test.ts` | 5 passed |
| `PricingGrid.test.tsx` | 24 passed |
| `catalogVisibility.pg.test.ts`, `pricing.adminGrid.pg.test.ts`, `sitemap.test.ts` | 11 + 17 passed |
| CI `checks` / `e2e` on PR #229 | pass / pass |
| `https://ahantime.com/` | 200, 43 ms |

The full suite was **not** run on this host — see CLAUDE.md; GitHub Actions is the authority.
`Workers Builds: ahantime` is red on both PRs and is known-red on `main` independently of any
change.

## Open items for the owner

1. **Price or retire the seven unpriced SKUs** (issue #2). Automation cannot and should not
   guess these.
2. **Decide the fate of 338 priced products** hidden behind 24 deactivated sub-categories
   (issue #3) — finish the ورق rebuild by re-parenting them, or confirm they are meant to stay
   hidden.
3. **723 prices are three days old and 159 are seven weeks old** (issue #1). Not a bug; a
   repricing backlog.
