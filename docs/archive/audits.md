# Historical reports — audits

These are historical snapshots, consolidated on 2026-09-06. Deployment, test, price and open-item claims apply to their original reporting context, not the current system. Original report bodies and decisions are retained; verify operational commands against the current runbooks before use.

[Documentation index](../README.md)

## Reports
- [AGENT_REPORT_audit_perf_seo.md](#agent-report-audit-perf-seo)
- [AGENT_REPORT_db_integrity.md](#agent-report-db-integrity)
- [AUDIT-CLOSEOUT.md](#audit-closeout)
- [AUDIT_REPORT.md](#audit-report)

---

<a id="agent-report-audit-perf-seo"></a>

## Source: `AGENT_REPORT_audit_perf_seo.md`

# AGENT_REPORT — DOM performance, SEO hygiene, content accuracy

**Date:** 1405/06/01 (2026-08-23) · **Worktree:** `.claude/worktrees/audit-perf-seo`
**Scope:** the DOM-duplication and SEO/content items of tonight's external audit.
Price/schema/deploy items belong to the sibling `price-accuracy` job and were not touched.

---

## 1. P1 — DOM duplication on the price table · **FIXED**

### What was wrong

`web/src/components/catalog/PriceTable.tsx` rendered every row **twice** for the
same `list`: a full `<table>` with one `<PriceTableRow>` per SKU, and a full
`<ul class="cards">` with one `<PriceTableCard>` per SKU. Both were always in the
DOM; `@media (max-width: 767px)` hid one with `display: none` and showed the
other. Confirmed by reading the source and by the live HTML.

### The fix

There is now **one** component and one DOM subtree per row. The table *reflows*
into the card at ≤767px instead of being replaced by a second markup:

- `thead` stops drawing; every cell carries `data-label` and the narrow
  stylesheet prints it with `::before` — the column header the cell loses when
  the table stops being laid out as a table, at **zero** extra elements.
- The price cell carries `data-unit` («تومان / کیلوگرم»), printed the same way,
  so a phone still sees the denomination the column header used to supply.
- A cell holding nothing but a «نامشخص» placeholder gets `blankOnNarrow` and is
  dropped at card widths — the old card's "omit a field rather than print a
  placeholder" rule, now expressed in CSS instead of a second component.
- The compare checkbox and the size cell (the size is already the tail of the
  product name) are hidden at card widths, exactly as the card omitted them.
- `role="table"/"rowgroup"/"row"/"columnheader"/"rowheader"/"cell"` are now
  spelled out. `display: block`/`flex` on table elements strips implicit table
  semantics in every browser — and the `<ul>` of cards this replaces had **no**
  table semantics at all, so this is a net a11y gain, not a workaround.

Files: `PriceTable.tsx`, `PriceTable.module.css`, plus five test files updated
(they asserted on the duplicate DOM, which is the thing being removed).

### Measured before/after — `/prices/rebar`, the page the audit measured

`BEFORE` = production `main` through Caddy. `AFTER` = the same page from a
container built from this branch, against the same live database (283 `<tr>` in
both, i.e. identical row set — not a mock render).

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Rendered HTML | 2,032,169 B | 1,436,902 B | **−29.3 %** |
| DOM elements (open tags) | 20,890 | 12,349 | **−40.9 %** |
| `<button>` elements | 1,989 | 1,057 | **−46.9 %** |
| `<li>` elements | 454 | 221 | **−51.3 %** |
| Inline script (RSC flight payload) | 302,353 B | 302,318 B | −0.01 % |
| `<tr>` (row set — sanity check) | 283 | 283 | unchanged |

Live DOM count in a real browser at 1440px: **12,234 elements, 1,057 buttons**
(matches the static count; the difference is client-only chrome).

### Both presentations verified in a browser

Driven against the candidate container, not asserted from the CSS:

| | 1440 × 1000 | 390 × 844 |
|---|---|---|
| `<table>` computed `display` | `table` | `block` |
| `<tr>` computed `display` | `table-row` | `flex` (a card, 324 px wide) |
| `thead` | `table-header-group` | `none` |
| `td[data-label]::before` | `none` | `"سایز: "` |
| price cell `::after` | `none` | `" تومان / کیلوگرم"` |
| compare / size / placeholder cells | shown | `display: none` |
| `role` on the table | `table` | `table` (preserved) |
| horizontal page overflow | – | none (`scrollWidth` 390 = viewport) |

Screenshots taken at both widths; the card renders name → hero price + unit +
movement → grade/factory/weight/delivery/date chips → full-width amber CTA,
which is the card that was there before. **Two real bugs were caught this way**
and fixed before review, neither of which any unit test would have found:

1. the narrow CTA read «سبد به سبد استعلام» — a CSS `::after` *appended* to the
   wide table's one-word label instead of replacing it;
2. its corrected «افزودن به سبد استعلام» was then **clipped mid-word**. That CTA
   shares its line with the three icon actions and gets 136 px at a 390 px
   viewport, where the string needed ~200.

It now reads «افزودن به سبد» — measured at 390 px: 136 px wide, 48 px tall,
`scrollWidth == clientWidth`, and inside the card's bounds.

### What I did NOT do, and why — please read before scoping follow-up work

The audit's targets were "≥60 % smaller HTML, DOM under ~6,000 nodes". The
single-DOM fix reaches −29 % / −41 %. **The remaining gap cannot be closed
without rendering fewer rows**, and the arithmetic says so plainly:

- `/prices/rebar` renders ~248 products. After the fix a row costs **41
  elements** and **3,665 bytes**.
- Even stripping *every* action control from every row leaves ~24 elements ×
  248 = **~5,950** — i.e. 6,000 nodes is the floor for this row count, reachable
  only by deleting the whole action column.

So the two lower-priority items:

**(a) Consolidating the four per-row action buttons into one menu — not done.**
Measured cost: the actions cell is **17 of 41 elements (41 %) and 1,891 of
3,665 bytes (52 %)** of every row. Folding favourite + alert + chart behind one
lazily-mounted menu would save ~10 elements and ~1,050 bytes per row →
roughly **−2,500 elements and −260 KB** (HTML would land near −42 % vs
baseline). I stopped short of shipping it because it is a UX change to the
site's primary conversion surface — the alert bell and the cart button are
lead-gen affordances, and hiding the favourite behind a menu also hides its
filled/unfilled state — and because it still does not reach the 6,000-node
target on its own. **Recommend: owner decides.** The numbers above are the
whole basis for that decision.

A safer variant with *zero* UX change and a comparable byte win: the four icon
SVGs are inlined per row (~1,400 B of repeated path data × 248 rows ≈ **350 KB**).
Moving them to one `<svg><use href="#icon-…">` sprite would recover most of that.
This touches the shared icon primitives app-wide, so it is its own piece of work.

**(b) Capping eagerly-rendered rows — not done, and I recommend against doing it
silently.** The `<details>` sections render every row into the server HTML *on
purpose*: the code comment at `PriceTable.tsx` states that collapsing is a pure
CSS affordance so "a crawler sees everything a human would after clicking
expand all", which is the long-tail SEO basis for the per-factory sections.
Capping rows deletes crawlable price content from the category page. The
facet routes the audit points at (`/prices/[category]/factory/[factory]`,
`/prices/[category]/size/[size]`) do exist and are in the sitemap, so the
*mechanism* is there — but the trade (fewer nodes vs. less indexable price
data on the money page) is an owner call, not a refactor.

---

## 2. Duplicate title / H1 text on sub-category pages · **FIXED**

Verified live before the change:

```
/prices/rebar/deformed     <title>قیمت روز میلگرد آجدار میلگرد | آهن‌تایم</title>
/prices/ibeam/tirahan      <title>قیمت روز تیرآهن تیرآهن | آهن‌تایم</title>
/prices/steel/pipe         <title>قیمت روز لوله استیل استیل | آهن‌تایم</title>
/prices/rebar/mylgrd-sadh  <title>قیمت روز میلگرد ساده میلگرد | آهن‌تایم</title>
```

…and the same doubled string in the H1 and the meta description of each.

`/prices/ibeam/tirahan` is the worst case the audit did not catch: that
sub-category is named *exactly* after its category.

**Scale, from the live DB:** **29 active sub-categories** across 6 categories
already contain their category's name — every one of them was shipping the word
twice in its title, H1 and description.

**Fix:** new `subCategorySubject(subName, categoryName)` in
`web/src/lib/utils/catalogLabels.ts`, used by all four call sites in
`web/src/app/prices/[category]/[sub]/page.tsx` (metadata title, metadata
description, `PriceHeader` title, `PriceHeader` description) so the page can
never advertise itself two ways. It appends the category only when the sub name
does not already contain it, matching on **whole space-separated tokens** of a
normalised form (ZWNJ folded to a space, Arabic ي/ك folded to Persian ی/ک) — both
spellings occur in admin-entered names.

Verified it does not break the cases where the suffix is load-bearing:
«هاش سبک» → «قیمت روز هاش سبک تیرآهن», «لانه زنبوری» → «… لانه زنبوری تیرآهن»,
«داربستی» → «… داربستی لوله». 6 unit tests in
`web/src/lib/utils/catalogLabels.subject.test.ts`, all built from live taxonomy
rows.

**Deliberately left alone:** the category «نبشی و ناودانی». Its subs («نبشی»,
«ناودانی سبک») each repeat *one word* of a two-word category without containing
the whole of it, so today they title as «قیمت روز نبشی نبشی و ناودانی». Trimming
per-token there produces «ناودانی سبک نبشی و», which is worse. That category
wants a shorter display name — an owner decision, not a string rule.

---

## 3. Retired taxonomy URLs · **investigated; one real finding, no redirect rows added**

`/prices/rebar/coupler` behaves correctly today: **404 + noindex**, no chain. As
the brief allows, I did not manufacture a 410 for it — there is no successor
sub-category to send it to (active میلگرد subs are آجدار / ساده / استیل only).

**Sitemap: clean.** All 55 retired (`is_active = false`) sub-category paths were
checked against the live `/sitemap.xml` (1,138 URLs). **Zero** appear.

**Internal links: one real finding.** 23 retired sub-category paths *are* still
linked, and all of them come from a single place — **the site's 404 page**.
`/prices/nonferrous` (a slug that does not exist; the real one is
`felezat-rangi`) returns 404, and that page's mega-menu is rendered from the
`MOCK_CATEGORY_SUBS` fixture in `web/src/lib/data/nav.ts`, because the not-found
page is generated at build time where `isLiveCatalog()` is false. Ten of those
fixture links are themselves hard 404s:

```
404  /prices/rebar/coil            404  /prices/profile/box-square
404  /prices/rebar/alloy           404  /prices/profile/box-rect
404  /prices/ibeam/light           404  /prices/profile/frame
404  /prices/sheet/checkered       404  /prices/sheet/colored
404  /prices/sheet/deck            404  /prices/sheet/alloy
```

(the other 13 resolve via existing 308s, e.g. `/prices/ibeam/hea` →
`/prices/ibeam/hash-sabok`.)

Impact is low — a crawler on a noindex 404 page — but a **human** who lands on a
404 gets a navigation menu where a third of the product links are broken. **Not
fixed here** because the fix (make the not-found shell's taxonomy DB-driven, or
drop sub-links from it) is a different change from this brief's scope and would
collide with nav work. **Recommend it as its own ticket.**

**Redirect rows: none added.** 24 of the 55 retired subs have no redirect row.
I did not add any, for two reasons: (1) almost none have an unambiguous
successor — `sheet/steel` (47 SKUs), `sheet/strip` (93), `rebar/coupler` (65)
are retired *products*, not renamed ones, and 404 + noindex is already the right
answer for them; (2) redirect rows are **production data**, and this repo's own
history records both a redirect shadowing a live sub-category page and redirect
chains landing on 404s. Candidates that *do* look unambiguous, for the owner to
confirm rather than for me to write:

| Retired path | Its name | Apparent successor |
|---|---|---|
| `/prices/profile/sakhtman` | ساختمان | `profile/prvfyl-sakhtmany` («پروفیل ساختمانی») |
| `/prices/profile/profil-sakhtemani` | پروفیل ساختمانی | same — currently 308s to the *category* |
| `/prices/profile/profil-steel` | پروفیل استیل | `profile/prvfyl-astyl` — currently 308s to the category |
| `/prices/angle-channel/nabshi-steel` | نبشی استیل | `steel/angle` (same name, other category) |
| `/prices/angle-channel/navdani-steel` | ناودانی استیل | `steel/channel` (same name, other category) |

The last four already 308 somewhere valid, so nothing is broken — they just land
on a category page instead of the specific successor, which loses the
specificity a 301 exists to preserve.

---

## 4. Sitemap `lastModified` always "now" · **FIXED**

Confirmed live: **0 of 1,138** sitemap entries omitted `<lastmod>`, and the
static ones were stamped with the request time. Under `dynamic = 'force-dynamic'`
that means every crawl saw «modified just now» for `/about`, `/contact`,
`/terms`, `/privacy`, the tools pages and the cooperation tracks — pages whose
copy changes a couple of times a year.

Two changes in `web/src/app/sitemap.ts`:

- **`lastModified` removed** from the 18 `STATIC_INDEXABLE` entries and the
  cooperation-track entries. Nothing in the app tracks when a hard-coded page's
  copy last changed, so there is no honest value; an omitted `<lastmod>` tells a
  crawler nothing, which is the truth. A comment says so, to stop it being
  "fixed" back to `now`.
- **A real date supplied** for the 8 `/blog/category/*` entries and any
  `/news/topic/*` entries: the newest `updatedAt`/`publishAt` among the articles
  filed under that category or topic. **No extra queries** — the full article
  sets are already fetched a few lines above.

The catalog entries were already honest (`current.updatedAt`) and are untouched.

---

## 5. Trust badges · **NOT changed — owner/legal decision, with a clear finding**

`web/src/components/layout/Footer.tsx:108-110` renders three plain `<li>`s from
`messages/fa.json` — «نماد اعتماد الکترونیکی», «ساماندهی», «اتحادیه آهن‌فروشان» —
with no link, no badge image and no verification identifier.

**I could not find any evidence the business holds these, and I found evidence
that it does not.** There is no eNamad code, Samandehi id, certificate number or
verification URL anywhere in the code, the `settings` table, or the DB. What the
project's own Layer-1/2 specs say is explicit and consistent:

- `product/product-scope.md:104` — "Trust/legal footer: eNamad/Samandehi **placeholders**, اتحادیه, contact…"
- `product/mvp.md:132` — "Footer: eNamad/Samandehi **placeholders**, channels, contact."
- `product/user-stories.md:239` / `product/acceptance-criteria.md:394` (AC-J-2) — "eNamad/Samandehi/اتحادیه **placeholders**"

So the specs describe these as placeholders awaiting real certification, and the
build shipped the placeholder text as if it were a claim.

**This is the item on the list I would act on first.** In Iran نماد اعتماد
الکترونیکی is a government-issued mark and ساماندهی is a Ministry of Culture
registration; displaying either without holding it is a regulatory exposure, not
just an SEO weakness. Per the brief I have **not** removed customer-facing trust
claims unilaterally.

**Owner decision needed, three options:**
1. The certifications are held → give me the eNamad code / Samandehi id and I
   will render each as a real linked badge with its official verification URL and
   self-hosted badge image (no CDN).
2. They are in progress → the honest interim is to remove the three `<li>`s until
   the marks are issued.
3. Only the اتحادیه membership is real → keep that one (linked or with a
   membership number) and drop the other two.

---

## 6. Categories with zero fresh-price coverage · **verified not applicable today**

Checked directly against the live database rather than deferring:

| category | active SKUs | priced | priced & updated ≤5 days |
|---|---:|---:|---:|
| میلگرد `rebar` | 259 | 258 | 258 |
| فلزات رنگی `felezat-rangi` | 148 | 148 | 148 |
| ورق `sheet` | 101 | 90 | 90 |
| پروفیل `profile` | 62 | 54 | 54 |
| لوله `pipe` | 59 | 38 | 38 |
| تیرآهن `ibeam` | 45 | 30 | 30 |
| استیل `steel` | 38 | 38 | 38 |
| نبشی و ناودانی `angle-channel` | 37 | 22 | 22 |

**No active category has 0 % coverage**; the lowest is نبشی و ناودانی at 59 %,
and every priced SKU is fresh well inside the 2-day
`PRICE_STALE_HIDE_AFTER_DAYS` window. So no landing page needs its «قیمت روز»
copy softened or a noindex today. The audit's premise was true earlier; the
price-coverage work already in flight closed it. **Nothing to do — re-check if
a category's sync source goes dark.**

---

## ⚠️ `main` does not currently build — both PRs are blocked on #249

Found while rebasing onto the current `origin/main` (`59a0e9e`): **`pnpm build`
and `tsc --noEmit` both fail on clean `main`**, with nothing of mine applied —

```
scripts/repairSeedPrices.ts(178,3): error TS2322:
  Property 'grade' is missing in type '{ … }' but required in type 'SeedRow'.
```

Introduced by #242 (`e59f3ef`), which made `grade` required on `SeedRow`
without adding it to the query's select. Verified by checking out
`origin/main` detached and running `tsc` with a clean tree.

**A fix is already open as #249** (`fix/typecheck-seedrow-grade`) — the sibling
`price-accuracy` job's. I did not duplicate it. Consequences:

- CI on **#250 and #251 will be red until #249 merges**, for a reason that is
  not theirs. Merge #249 first, then re-run.
- Auto-deploy is also blocked: the GHCR `build` job cannot go green on `main`.
- To verify my own work end-to-end I applied #249's one-line diff **locally,
  build-only**, built the image, and reverted it before committing. That build
  was green and served every measurement and browser check in this report.

## Branches / PRs

Two PRs, split by theme, both left open for review — not merged.

| PR | Branch | Contents |
|---|---|---|
| DOM | `perf/price-table-single-dom` | `PriceTable.tsx`, `PriceTable.module.css`, 5 test files |
| SEO | `seo/sub-title-and-sitemap-lastmod` | `catalogLabels.ts` + new test, `[sub]/page.tsx`, `sitemap.ts`, this report |

### Checks run locally

- `tsc --noEmit` — clean
- `next lint` on every touched file — clean
- `stylelint` on `PriceTable.module.css` — clean
- `vitest` (targeted, never the full suite on this box — past OOM):
  `src/components/catalog/` **138 passed**; `src/lib/utils/` + `src/components/layout/`
  + `src/app/sitemap.test.ts` **261 passed**
- Full `next build` in Docker — green on this branch's content once #249's
  one-line fix to `repairSeedPrices.ts` is applied (see the blocker above); the
  resulting image served every measurement and browser check in this report.

---

<a id="agent-report-db-integrity"></a>

## Source: `AGENT_REPORT_db_integrity.md`

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
| CI `checks` / `e2e` on #229, #230, #232 | pass / pass on all three |
| `https://ahantime.com/` | 200, 43 ms |

The full suite was **not** run on this host — see CLAUDE.md; GitHub Actions is the authority.
`Workers Builds: ahantime` is red on all three PRs and is known-red on `main` independently of any
change.

### A note on the e2e flake

`e2e` failed once on #232 and once on #230 before going green on re-run. Both failures were the
same pair — `admin-pricing-catalog.spec.ts:242` («creating a product from the drawer…»,
`getByText('بدون قیمت')`) failing and `:81` («pricing grid loads the seeded catalog…») flaky —
with the identical tally `1 failed / 1 flaky / 1 did not run / 21 passed`.

It is environmental, and #232 proves it: that PR contains one markdown file and **no code at
all**. The tell is in the job log rather than the Playwright output — `[WebServer]` reports
`Failed query: select "updated_at" from "current_prices"` and `Failed query: insert into
"sms_log"`, i.e. the CI Postgres intermittently refusing queries. Whichever test is running at
that moment is the one that fails.

CLAUDE.md's note that `CI / e2e` has been reliable since #208 does not hold for this spec.

## Open items for the owner

1. **Price or retire the seven unpriced SKUs** (issue #2). Automation cannot and should not
   guess these.
2. **Decide the fate of 338 priced products** hidden behind 24 deactivated sub-categories
   (issue #3) — finish the ورق rebuild by re-parenting them, or confirm they are meant to stay
   hidden.
3. **723 prices are three days old and 159 are seven weeks old** (issue #1). Not a bug; a
   repricing backlog.

---

<a id="audit-closeout"></a>

## Source: `AUDIT-CLOSEOUT.md`

# AUDIT-CLOSEOUT — بستن ممیزی W29

**تاریخ:** 2026-08-04 · **برنچ:** `audit/full-w29` · **پایه:** `23dccf5` روی `main` · **۶۱ کامیت**

این سند وضعیت *پایانی* ممیزی است. سند اصلی — [`AUDIT_REPORT.md`](audits.md#audit-report) — عکس لحظه‌ای ۳ آگوست است و **شواهد** هر یافته را نگه می‌دارد؛ آن را دست‌نخورده گذاشتم چون ارزشش در ارجاع به کد و پاسخ HTTP واقعی است. هرجا این دو اختلاف دارند، **این سند جدیدتر است**.

---

## خلاصه

| | گزارش ۳ آگوست | حالا |
|---|---:|---:|
| فیکس‌شده و کامیت‌شده | ۲۹ | **۱۰۹** |
| باز، بی‌خطر، اعمال‌نشده | ۵۵ | **۰** |
| نیازمند تصمیم مالک | ۳۸ | **۹** |
| WONTFIX (تصمیم آگاهانه) | ۲ | **۶** |
| «یافته» که در واقع یافته نبود | — | **۵** |

اعتبارسنجی در HEAD: `tsc --noEmit` تمیز · `stylelint` تمیز · **۹۵ فایل تست، ۹۸۱ تست، همه سبز** · `next build` موفق · e2e RBAC ‏۹/۹ · پروداکشن روی همین کامیت در حال اجرا و healthy.

---

## پنج چیزی که ممیزی اشتباه گفته بود

صادقانه ثبت می‌شود، چون یک ممیزی که فقط تأیید خودش را جمع کند بی‌ارزش است:

1. **«جدول قیمت سمت کلاینت رندر می‌شود.»** نمی‌شود. `/prices/pipe` ‏۴۶ ردیف `<tbody>` در HTML سرور دارد. آن زیردستهٔ صفر-ردیف **صفر محصول** داشت — علتش مورد ۱ در «تصمیم مالک» است.
2. **«Matomo بدون ناشناس‌سازی IP اجرا می‌شود.»** از قبل فعال بود.
3. **«`Marquee` با آفست فیزیکی `left` اسکرول می‌کند.»** نمی‌کند؛ `transform: translateX` است.
4. **«رادیوگروپ‌ها فاقد سمانتیک‌اند.»** نیستند؛ `fieldset`+`legend` با رادیوی نیتیو، که درست‌تر از `role="radiogroup"` است.
5. **«متای `robots` تکراری.»** روی هیچ صفحه‌ای بازتولید نشد.

و سه جا که مشکل **بدتر یا متفاوت** از توصیف بود:

- **`restic`**: مشکل `--prune` نبود. `--group-by host,paths` بود — چون هر دامپ مسیر زمان‌دار یکتا دارد، هر اسنپ‌شات گروهِ خودش می‌شد و `--keep-daily 14` **هیچ‌وقت چیزی حذف نمی‌کرد**.
- **`100vh`**: کدبیس همه‌جا `100svh` **بدون fallback** داشت — روی مرورگر قدیمی‌تر اعلان دور ریخته می‌شد و ارتفاع کامل بدنه/پنل کلاً از بین می‌رفت.
- **lookbehind در رجکس**: در باندل ادمین نبود، در `ArticleBody` بود — یعنی **هر صفحهٔ مقالهٔ عمومی** — و چون در Safari زیر ۱۶.۴ خطای *نحوی* است، صفحه را سفید می‌کرد.

---

## دو چیزی که ممیزی اصلاً ندیده بود و از همهٔ یافته‌هایش مهم‌ترند

### ۱. ۱۶۷ از ۲۴۰ محصول روی سایت نامرئی‌اند

یک مهاجرت تاکسونومی **نیمه‌کاره**: زیردسته‌های جدید ساخته شده، قدیمی‌ها غیرفعال شده، ولی SKUها جابه‌جا نشده‌اند. هر مسیر خواندن روی `is_active` فیلتر می‌کند، پس محصولات ناپدید شده‌اند.

| دسته | زیردسته‌های خاموش | محصولات گیرافتاده |
|---|---|---:|
| profile | z, column, box-square, box-rect, frame, furniture, galvanized | ۴۰ |
| angle-channel | angle, tbar, channel-heavy, channel-light, angle-unequal, spot | ۳۲ |
| ibeam | hea, heb, ipe, light, castellated | ۲۵ |
| rebar | alloy, stirrup, coil, deformed-a2 | ۲۲ |
| **sheet** (کل دسته `is_active=false`) | همه | ۴۸ |

جفت‌های تکراری: `angle`(۷، خاموش)↔`nabshi`(۰، روشن) · `stirrup`(۷)↔`khamut`(۰) · `hea`(۶)↔`hash-sabok`(۰) · `tbar`(۵)↔`separi`(۰) · `z`(۷)↔`profil-z`(۰).

**عمداً هیچ فلگی عوض نشد** — این کار ۱۶۷ صفحهٔ محصول را منتشر می‌کند و بین زیردسته‌های تکراری برنده انتخاب می‌کند. تصمیم مالک است. اسکریپت انتقال بعد از تأیید جفت‌ها نوشتنی است.

### ۲. قیمت‌ها ۲۸ روز به‌روز نشده‌اند

`max(current_prices.updated_at)` = **۱۴۰۵/۰۴/۱۶**. آستانهٔ کهنگی ۲ روز است، پس **هیچ `Product`/`Offer` ای در JSON-LD صادر نمی‌شود** — فقط `BreadcrumbList` و `ItemList`. یعنی مزیت سئویی «قیمت شفاف» که کل معماری SSR/ISR برایش انتخاب شد، همین حالا صفر است. کار ادمین است، نه کد.

---

## آنچه فیکس شد (۱۰۹ مورد، ۶۱ کامیت)

**امنیت** — گیت ادمین fail-closed · دو open redirect + IDOR گفتگوی AI · دور زدن rate limit با `CF-Connecting-IP` · کلمپ `perPage` · پروکسی کل سطح Matomo روی دامنهٔ اصلی · مجوز دامپ‌های PII · بستن ثبت‌نام GlitchTip · هر دو اوراکل شمارش شمارهٔ کاربر (پنل + `isNewUser`) · خانواده‌های refresh token با تشخیص استفادهٔ مجدد · بستن سطح `sql.raw`.

**صحت داده و مالی** — واحد از SKU گرفته می‌شود نه از درخواست (باگ ۱۲ برابر کم‌قیمت‌دهی روی پیش‌فاکتور) · قیمت‌های ساختگی بازار · **یک فرمول وزن به‌جای چهار تای واگرا** (نبشی در چت جواب می‌داد ولی از API ۴۰۰ می‌گرفت؛ «نبشی/تسمه» در وزن‌سنج تسمهٔ تخت حساب می‌کرد و در مشاور نبشی بال‌مساوی) · وزن منفی لوله → ۴۲۲.

**کارایی** — پنج N+1 (تسویهٔ انبار، `/search`، `/api/me/leads`، `/api/me/export`) · **۲۵ ایندکس با `CREATE INDEX CONCURRENTLY` روی دیتابیس زنده، بدون قفل نوشتن** + کلید خارجی `users.referred_by` · `escapeLike` · jitter روی TTLهای Redis · پاک‌سازی کران‌دار `market_points` · پنجرهٔ کش قیمت ۴۲۰ثانیه → ۱۲۰ثانیه · حذف Sentry از ۶ چانک کلاینت · lazy کردن متادیتای تلفن در `/login`.

**زیرساخت و رصدپذیری** — بکاپ برون‌سایتی که ۳ شب بی‌صدا شکسته بود · retention واقعی restic + **تست بازیابی واقعی** · پایش uptime روی خود سرور با نردبان تشدید و صفحهٔ خطای برندشدهٔ فارسی · CI بالاخره همان چیزی را می‌سازد که دیپلوی می‌شود · همهٔ اکشن‌های GitHub و ایمیج GlitchTip پین شدند · خطاهای سمت کلاینت دیگر دور ریخته نمی‌شوند · `redact()` بازگشتی · رلهٔ هشدار GlitchTip → پیامک با throttle سخت · Web Vitals واقعاً ثبت می‌شود.

**دسترسی‌پذیری** — حاشیهٔ فیلدها ۱.۲۲:۱ → ۳.۳۲:۱ · دکمهٔ توقف واقعی نوار قیمت · `CountrySelect` روی الگوی کامل ARIA 1.2 · صفحهٔ سفید Safari (lookbehind) · `safeStorage` · fallback کارتی · تارگت‌های لمسی · توکن‌های تیرهٔ سود/زیان.

**سئو و حقوقی** — ۵۳ اسلاگ خوانا با ۵۳ ری‌دایرکت ۳۰۸ (هر ۵۳ جفت با curl تأیید شد) · Soft 404ها بسته شد با تأیید اینکه **هر ۱۵۴ مسیر زنده هنوز ۲۰۰ می‌دهد** · `Offer` دیگر هرگز `InStock` پیش‌فرض نمی‌شود · افشای پردازش برون‌مرزی هوش مصنوعی · کاوه‌نگار → SMS.ir · Matomo بدون کوکی.

**هوش مصنوعی** — مهاجرت از DeepSeek (که با HTTP 402 مرده بود) به Parspack AI Studio · سقف بودجهٔ روزانهٔ توکن · افت ظریف در ۴۰۲/۴۰۱/۴۲۹/timeout به‌جای ارور خام · تطبیق تحمل‌پذیر کاتالوگ برای غلط‌های تایپی مدل.

---

## نیازمند تصمیم یا دسترسی شما (۹ مورد)

| # | مورد | چرا فقط شما |
|---|---|---|
| ۱ | **۱۶۷ محصول نامرئی** (بالا) | انتشار ۱۶۷ صفحه + انتخاب برنده بین زیردسته‌های تکراری |
| ۲ | **قیمت‌ها ۲۸ روز کهنه** (بالا) | ورود قیمت کار ادمین است |
| ۳ | **بکاپ واقعاً برون‌سایتی نیست** — هر دو نسخه روی همان دیسک فیزیکی دیتابیس‌اند | نیاز به یک bucket S3 (آروان/لیارا). ضمناً تأیید کنید `RESTIC_PASSWORD` جایی **خارج از این سرور** ذخیره است |
| ۴ | **کلید SSH دیپلوی هرگز چرخانده نشده** و یک بار در چت پیست شده | ابطال در GitHub → Deploy keys؛ صرفاً ساخت کلید جدید کافی نیست |
| ۵ | **پورت‌های ۸۴۴۳ و ۹۴۴۳ روی کل اینترنت بازند** | توصیه: ببندید و از تونل SSH وصل شوید (`ssh -L 8443:127.0.0.1:8443`) |
| ۶ | **ProjectAlert در GlitchTip ساخته نشده** | رله زنده و تست‌شده است ولی تا وقتی وبهوک را نسازید هیچ‌چیز صدایش نمی‌زند (مراحل در `.env.example`) |
| ۷ | **`REFRESH_REUSE_DETECTION=detect`** — سرقت توکن تشخیص داده می‌شود ولی مهاجم بیرون انداخته نمی‌شود | `enforce` بعد از یک هفته لاگ تمیز |
| ۸ | **`AI_TIMEOUT_MS` از ۲۰ به ۴۵ ثانیه رفت** | AC-D-9 می‌گفت «هرگز بیش از ۲۰ ثانیه». مدل جدید reasoning است و با ۲۰ ثانیه هر سؤال ابزاری قطعاً خطا می‌داد |
| ۹ | **Matomo روی `CoreUpdater` گیر کرده** — یک ارتقای نیمه‌اعمال‌شده | از کنسول ‏:8443 تمامش کنید |

---

## WONTFIX — تصمیم آگاهانه

- **مهاجرت به سگمنت `[locale]`** برای en/ar/zh. کاتالوگ‌های پیام فقط ۱۰ فضای‌نام پوستهٔ سایت دارند (بدون قیمت، کاتالوگ، AI، ابزارها)، پس انتخاب انگلیسی یک قاب LTR دور محتوای فارسی می‌دهد. مسدودکنندهٔ واقعی **محتواست، نه مسیردهی**. ضمناً `hreflang`/`noindex` هم بی‌معنی است چون en/ar/zh اصلاً URL ندارند. وقتی ارزشش را داشت، شکل ارزان این است: فقط زبان‌های غیرپیش‌فرض پیشوند بگیرند (`/en/…`) تا **هیچ URL ایندکس‌شده‌ای جابه‌جا نشود**.
- **`price_points` بی‌نهایت رشد می‌کند** — طبق spec عمدی است.
- **`0021_snapshot.json` غایب** — زنجیرهٔ `prevId` سالم و drift صفر؛ ساختنش زنجیره را می‌شکند.
- **پول ادمین در تب پس‌زمینه** — تصمیم صریح محصول.
- **TTL توکن دسترسی روی ۴ ساعت** — کوتاه‌کردنش وابستگی به مسیر refresh را زیاد می‌کند؛ پشت مورد ۷ گیت شده.
- **ادغام breakpointهای ۸۹۹/۹۰۰ و ۷۶۷/۷۶۸** — این‌ها جفت‌های مکمل‌اند و ادغامشان باگ دوبار-اعمال می‌سازد.

---

## دام‌هایی که به‌سختی به دست آمد (برای نفر بعد)

- **`web/drizzle/*.sql` هرگز نباید رشتهٔ `--> statement-breakpoint` را داخل کامنت داشته باشد.** drizzle با همان توکن دستورات را جدا می‌کند، پس مهاجرت وسط کامنت می‌شکند و **هر دیتابیس تازه‌ای را از کار می‌اندازد**.
- **`CREATE INDEX CONCURRENTLY` از داخل مهاجرت drizzle ممکن نیست** — migrator کل اجرا را در یک تراکنش می‌پیچد. الگوی به‌کاررفته: اعمال دستی `CONCURRENTLY` روی دیتابیس زنده + مهاجرت idempotent با `IF NOT EXISTS` که روی دیتابیس زنده no-op و روی دیتابیس تازه کامل است.
- **`git stash` قبل از `reset --hard` باید بدون `-u` باشد** — `reset --hard` هرگز فایل‌های untracked را دست نمی‌زند، ولی `-u` می‌تواند `.env` را وسط دیپلوی جارو کند.
- **`Caddyfile` تک‌فایل bind-mount است** — ویرایش به کانتینر نمی‌رسد و `caddy reload` می‌گوید «config is unchanged». باید `--force-recreate` کرد.
- **این مدل reasoning ~۹۵٪ توکنش را صرف فکر کردن می‌کند** مگر `reasoning_effort` ست شود؛ ولی با `none` اصلاً ابزار صدا نمی‌زند و شروع می‌کند به ساختن اطلاعات. `low` کف قابل استفاده است.

---

<a id="audit-report"></a>

## Source: `AUDIT_REPORT.md`

# AUDIT_REPORT — ahantime.com

**تاریخ:** 2026-08-03 · **برنچ:** `audit/full-w29` · **پایه:** `23dccf5` روی `main`
**دامنه:** ۳۰ حوزه، کل مخزن `/opt/ahantime` (اپ در `web/` — ‏۶۲۰ فایل TS/TSX، ‏۷۰ هزار خط، ‏۱۲۲ route handler، ‏۲۷ migration)
**روش:** ۹ ایجنت ممیزی موازی و فقط‌خواندنی → تأیید دستی هر یافته روی کد یا پاسخ HTTP واقعی → اعمال ترتیبی فیکس‌ها، یک کامیت به‌ازای هر حوزه

---

> **وضعیت این سند:** عکس لحظه‌ای ۳ آگوست ۲۰۲۶ است و عمداً دست‌نخورده مانده، چون ارزشش در
> شواهد هر یافته است (ارجاع به خط کد و پاسخ HTTP واقعی). وضعیت **پایانی** ممیزی در
> [`AUDIT-CLOSEOUT.md`](audits.md#audit-closeout) است: ۱۰۹ مورد فیکس شد، صفر مورد «باز و بی‌خطر»
> باقی ماند، ۹ مورد تصمیم مالک است — و پنج «یافته» در این سند در واقع یافته نبودند.
> هرجا این دو اختلاف دارند، سند بستن جدیدتر است.


## خلاصهٔ مدیریتی

| | تعداد |
|---|---:|
| **کل مشکلات تأییدشده** | **۱۲۴** |
| CRITICAL | ۷ |
| HIGH | ۲۷ |
| MEDIUM | ۵۴ |
| LOW | ۳۶ |
| **فیکس‌شده و کامیت‌شده** | **۲۹** |
| **نیازمند تأیید شما (NEEDS-HUMAN-REVIEW)** | **۳۸** |
| باز، بی‌خطر برای فیکس، هنوز اعمال‌نشده | ۵۵ |
| بررسی‌شده و تصمیم آگاهانهٔ پروژه (WONTFIX) | ۲ |

### سه چیزی که همین حالا در حال آسیب‌زدن بودند

۱. **بکاپ برون‌سایتی سه شب پیاپی بی‌صدا شکست خورده بود** (۱، ۲، ۳ آگوست). یونیت systemd متغیر `HOME` نداشت و restic بدون آن hard-fail می‌کند. دامپ محلی سالم بود، پس همه‌چیز سالم به‌نظر می‌رسید — ولی مخزن restic روی یک اسنپ‌شات ۳۱ ژوئیه مانده بود و هیچ‌چیز exit code را نمی‌پایید. **فیکس شد و تأیید شد** (`fb5d036`).

۲. **قیمت‌های ساختگی به کاربران واقعی نمایش داده می‌شد.** هر وقت API بازار آرایهٔ خالی برمی‌گرداند، `MarketBoard` به fixtureهای mock برمی‌گشت — که `source: 'tgju'` و `isStale: false` دارند. اختلاف با نرخ زنده: دلار ۲.۳ برابر، طلای ۱۸ عیار **۴.۸ برابر**. و این مسیر همین الان فعال بود، چون poller‏ tgju مدام fail می‌کند. روی سایتی که کل موضعش شفافیت قیمت است. **فیکس شد** (`92cab87`).

۳. **مشاور هوش مصنوعی از کار افتاده و کسی خبر ندارد.** GlitchTip امروز `Error: deepseek HTTP 402` ثبت کرده — یعنی اعتبار relay تمام شده. GlitchTip‏ ۱۹۳۹ ایشو دارد، **صفر** گیرندهٔ هشدار و **صفر** اعلان. و ۱۹۳۲ تای آن‌ها سه پیام circuit-breaker هستند که چون شمارنده داخل متن خطا بود، هر بار ایشوی جدید می‌ساختند. گروه‌بندی فیکس شد (`92cab87`)؛ **راه‌اندازی کانال هشدار تصمیم شماست** — پایین ببینید.

---

## راهنمای برچسب‌ها

**شدت:** `CRITICAL` همین الان قابل سوءاستفاده / داده یا پول اشتباه / جریان اصلی شکسته · `HIGH` تحت شرایط محتمل قابل سوءاستفاده یا یک کلاس کامل از صفحات آسیب‌دیده · `MEDIUM` شکاف دفاع‌در‌عمق یا ناکارآمدی واقعی · `LOW` سخت‌سازی

**وضعیت:** `FIXED` در این برنچ اصلاح شد · `NEEDS-HUMAN-REVIEW` عمداً دست‌نخورده — دلیلش ذکر شده · `OPEN` بی‌خطر برای فیکس ولی هنوز اعمال نشده · `WONTFIX` تصمیم آگاهانهٔ پروژه است

---

# بخش ۱ — نیازمند تأیید شما (۳۸ مورد)

اینها را **عمداً فیکس نکردم**. هر کدام یا برگشت‌ناپذیر است، یا منطق مالی را عوض می‌کند، یا می‌تواند کاربران فعلی را لاگ‌اوت/بلاک کند، یا تصمیم مالک است نه فیکس کد.

## ۱.۱ — امنیت زیرساخت (فوری‌ترین‌ها)

### 🔴 CRITICAL · یک کپی احراز‌هویت‌نشده از پنل ادمین روی اینترنت است
**حوزه ۲۳** · `web/wrangler.jsonc` · گیت در `web/src/middleware.ts:38`

```
curl https://ahantime.giminesap.workers.dev/admin       → 200  (شل واقعی ادمین، «داشبورد»)
curl https://ahantime.giminesap.workers.dev/admin/leads → 200
curl --resolve ahantime.com:443:127.0.0.1 .../admin     → 404  (پروداکشن، درست)
```
روی این Worker متغیر `AUTH_ENFORCED` تنظیم نشده، پس **هم** ری‌رایت ۴۰۴ میزبان عمومی **هم** گیت JWT کاملاً دور زده می‌شوند. `/api/admin/*` فقط به این دلیل ۵۰۳ می‌دهد که `DATABASE_URL` ندارد.

**چرا خطرناک است:** یک متغیر محیطی با فاجعه فاصله دارد. خود `wrangler.jsonc` (خطوط ۸-۱۶) قصد تنظیم `SESSION_SECRET`، `SMSIR_*`، `DEEPSEEK_*` و `DATABASE_URL` روی همین Worker را مستند کرده، و خطوط ۷۶-۷۹ نقشهٔ اتصال `ahantime.com` به آن را. لحظه‌ای که یک DB وصل شود، هر lead، سفارش، شمارهٔ موبایل مشتری و اندپوینت نوشتن ادمین عمومی می‌شود.

**پیشنهاد:** یا `wrangler delete ahantime`، یا اگر باید بماند: `AUTH_ENFORCED=true` + یک `PANEL_HOSTNAME` متفاوت + Cloudflare Access جلوی هاست `*.workers.dev` و غیرفعال‌کردن روت `workers.dev` در داشبورد.
**چرا فیکس نکردم:** به حساب Cloudflare شما نیاز دارد و حذف یک deployment برگشت‌ناپذیر است.

---

### 🟠 HIGH · کل سطح ادمین Matomo روی دامنهٔ اصلی پروکسی شده
**حوزه ۶، ۲۳** · `Caddyfile:32-38`

کامنت خودِ فایل می‌گوید «فقط این دو فایل پروکسی می‌شوند» — ولی دایرکتیو یک `handle` پیشوندی است، نه تطبیق فایل:
```
curl 'https://ahantime.com/mt/index.php?module=CoreUpdater&action='
  → <title>Matomo › Update</title>   (صفحهٔ به‌روزرسانی Matomo، بدون احراز هویت)
```
هر ماژول، فرم ورود، اندپوینت API و updater‏ Matomo روی دامنهٔ مشتری‌رو در دسترس است — هم‌مبدأ با کوکی‌های اپ و داخل `CSP 'self'`. ضمناً این نمونه در وضعیت «ارتقای اعمال‌نشده» گیر کرده.

**پیشنهاد:** جایگزینی با تطبیق مسیر دقیق `@matomo path /mt/matomo.js /mt/matomo.php` + `handle /mt/* { respond 404 }`، بعد تکمیل ارتقا از کنسول ‏:8443.
**چرا فیکس نکردم:** تغییر پیکربندی Caddy روی edge زنده — یک اشتباه سایت را از دسترس خارج می‌کند.

---

### 🟠 HIGH · GlitchTip ثبت‌نام آزاد دارد و روی اینترنت باز است
**حوزه ۲۳، ۲۴** · `docker-compose.yml:374-376`

کامنت بالای تنظیم دقیقاً خلاف خودِ تنظیم را می‌گوید:
```yaml
# ... Registration stays CLOSED — the account is provisioned from the CLI instead.
ENABLE_USER_REGISTRATION: "true"     # ← کامنت می‌گوید بسته
```
تأیید زنده: `firewall-cmd` پورت ‏9443/tcp را باز نشان می‌دهد و `/register` کد ۲۰۰ می‌دهد. `ENABLE_ORGANIZATION_CREATION: false` شعاع انفجار را محدود می‌کند (کاربر تازه بدون سازمان می‌ماند)، ولی به مهاجم یک جای پای احراز‌هویت‌شده داخل API‏ GlitchTip می‌دهد.

**پیشنهاد:** `ENABLE_USER_REGISTRATION: "false"` + محدودکردن ‏:9443 و ‏:8443 به IP اپراتور.
**چرا فیکس نکردم:** روی این هاست SMTP وجود ندارد، پس **مسیر بازیابی رمز نیست**. باید اول تأیید کنید حساب خودتان کار می‌کند، بعد ثبت‌نام بسته شود.

---

### 🟠 HIGH · Next.js نسخهٔ ‏15.5.19 — سه CVE با شدت HIGH از جمله SSRF در rewrite
**حوزه ۷** · `web/package.json:37` → `pnpm-lock.yaml` → `next@15.5.19`

`pnpm audit --prod` واقعاً اجرا شد (رجیستری در دسترس بود):
```
HIGH  next <15.5.21  CVE-2026-64645  SSRF in rewrites via attacker-controlled destination
HIGH  next <15.5.21  CVE-2026-64649  SSRF in Server Actions on custom servers
HIGH  next <15.5.21  CVE-2026-64641  DoS in App Router
+ ۵ مورد MODERATE (افشای Server Function، cache confusion، DoS در بهینه‌ساز تصویر)
```
`CVE-2026-64645` مستقیماً مرتبط است: این اپ redirect/rewriteهای دیتابیس‌محور را از `middleware.ts` اجرا می‌کند. `CVE-2026-64649` هم صدق می‌کند چون دیپلوی Docker یک سرور سفارشی دارد (`cluster.mjs`).

**پیشنهاد:** `pnpm up next@^15.5.21 eslint-config-next@^15.5.21`.
**چرا فیکس نکردم:** ارتقای minor روی یک اپ Next پروداکشن به یک build کامل + اجرای e2e نیاز دارد، نه یک ویرایش فایل.

---

### 🟠 HIGH · پین `postcss` کهنه شده — هنوز روی رنج آسیب‌پذیر می‌نشیند، و همین است که CI را همیشه قرمز نگه داشته
**حوزه ۷** · `web/package.json:82-86`

```json
"pnpm": { "overrides": { "postcss": ">=8.5.10" } }   → resolve به 8.5.15
HIGH  postcss ≤8.5.17  GHSA-r28c-9q8g-f849  Path Traversal → افشای فایل .map
```
**این پاسخ سؤال «چرا job‏ checks هر کامیت قرمز است» است.** بازتولید دقیق آنچه `ci.yml:65` اجرا می‌کند: `pnpm audit --prod --audit-level=high` → **۱۵ آسیب‌پذیری، ۹ HIGH، خروج غیرصفر**. آن ۹ مورد: `next` ×۳، `postcss` ×۱، `brace-expansion` ×۴، `js-yaml` ×۱. **گیت هشدار کاذب نیست.**

نکتهٔ تلخ: override برای رفع یک advisory قدیمی‌تر اضافه شده بود و بی‌صدا کهنه شده — یعنی الان پروژه را **روی** رنج آسیب‌پذیر پین می‌کند در حالی که شبیه رفع مشکل به‌نظر می‌رسد. و چون گیت آن‌قدر قرمز مانده که `CLAUDE.md` به ایجنت‌ها می‌گفت دنبالش نروند، دیگر نمی‌تواند یک وابستگی بحرانی جدید را نشان دهد.

**پیشنهاد:** override را به `">=8.5.18"` ببرید و `"brace-expansion": ">=5.0.8"` و `"js-yaml": ">=4.3.0"` اضافه کنید، بعد `pnpm install`.
**چرا فیکس نکردم:** به `pnpm install` و بازتولید lockfile نیاز دارد که باید با build کامل تأیید شود.

---

### 🟠 HIGH · کلید SSH دیپلوی که فاش شده هنوز زنده است
**حوزه ۵** · `~/.ssh/ahantime_deploy`

ممیزی تأیید کرد **هیچ ماده کلیدی در مخزن یا تاریخچهٔ گیت نیست** (`git log --all -p -G'BEGIN .* PRIVATE KEY'` بدون نتیجه) و مجوز فایل ۶۰۰ است. مشکل سمت فایل‌سیستم نیست: طبق سابقهٔ خود پروژه، این کلید یک بار در چت پیست شده و **هرگز چرخانده نشده**. هرکس آن رونوشت را داشته باشد می‌تواند روی `main` پوش کند، که `deploy.yml` را تریگر می‌کند → build ایمیج GHCR → اجرای کد دلخواه در کانتینر پروداکشن.

**پیشنهاد:** کلید جدید بسازید، به‌عنوان deploy key با دسترسی نوشتن اضافه کنید، **کلید قدیمی را در GitHub → Settings → Deploy keys حذف کنید**. صرفاً چرخاندن روی دیسک هیچ کاری نمی‌کند — ابطال سمت GitHub خودِ فیکس است.
**چرا فیکس نکردم:** به دسترسی GitHub شما نیاز دارد و ابطال کلید اشتباه دیپلوی را می‌شکند.

---

## ۱.۲ — بکاپ و بازیابی

### 🔴 CRITICAL · هر دو نسخهٔ بکاپ روی همان دیسک فیزیکی دیتابیس‌اند
**حوزه ۲۲** · `/etc/ahantime-backup.env` → `RESTIC_REPOSITORY=/var/backups/restic-ahantime`

```
/var/backups/restic-ahantime   /dev/vda4
/var/backups/ahantime          /dev/vda4
/var/lib/docker (pgdata)       /dev/vda4     ← همه یکی، ۷۸٪ پر
```
خود اسکریپت صادق است: «تا وقتی مالک یک bucket نداده، این **برون‌سایتی نیست** و ریسک را نمی‌بندد.» خرابی دیسک یا از دست‌رفتن حساب هاستینگ، دیتابیس زنده و ۱۶ دامپ روزانه و مخزن رمزشدهٔ restic را **در یک رویداد** نابود می‌کند.

**پیشنهاد:** یک bucket سازگار با S3 و قابل‌دسترس از ایران (آروان/لیارا)، بعد `RESTIC_REPOSITORY=s3:...` + کلیدها در `/etc/ahantime-backup.env` و `restic init`.
**همچنین:** تأیید کنید `RESTIC_PASSWORD` جایی **خارج از این سرور** ذخیره است — بدون آن مخزن رمزشده حتی برای خودتان بازیابی‌ناپذیر است.
**چرا فیکس نکردم:** به اعتباری نیاز دارد که فقط شما می‌توانید تهیه کنید.

---

## ۱.۳ — پایش و هشدار

### 🔴 CRITICAL · GlitchTip‏ ۱۹۳۹ ایشو ثبت کرده و هرگز به کسی خبر نداده
**حوزه ۱۶** · کوئری زنده روی `glitchtip-db`

```
projectalerts | 0        recipients | 0        notifications | 0
issue_events_issue | 1939
```
`docker-compose.yml:374` صریح است: «روی این هاست SMTP وجود ندارد.» پس حتی اگر هشداری تعریف شود، قابل تحویل نیست. **دو خرابی واقعی پروداکشن همین الان داخلش نشسته‌اند:** `deepseek HTTP 402` (اولین بار **امروز**) و دو خطای کوئری دیتابیس.

**پیشنهاد:** ایمیل جواب نیست. یک ProjectAlert از نوع **Webhook** بسازید. کم‌اصطکاک‌ترین گزینه چون SMS.ir از قبل سیم‌کشی شده: یک روت کوچک `/api/internal/alert-relay` که payload وبهوک را می‌گیرد و به موبایل شما پیامک می‌زند — **با throttle شدید**.
**چرا فیکس نکردم:** انتخاب کانال هشدار و پذیرش هزینهٔ پیامک تصمیم شماست. (گروه‌بندی ایشوها را فیکس کردم تا این کار حالا عملی باشد — قبلش دقیقه‌ای یک هشدار می‌آمد.)

---

### 🟠 HIGH · هیچ‌چیز uptime پروداکشن را نمی‌پاید؛ تنها canary خودکار به یک پیش‌نمایش mock اشاره می‌کند
**حوزه ۲۴** · `.github/workflows/ai-smoke.yml:28`

```yaml
BASE_URL: https://ahantime.giminesap.workers.dev   # ← پیش‌نمایش Workers بدون DB
```
```
uptime_monitor در GlitchTip: 0        crontab: فقط Matomo archive
systemd timers: فقط ahantime-backup   Caddyfile:41: reverse_proxy بدون health_uri
```
healthcheck کانتینر واقعی است ولی Compose فقط **برچسب** unhealthy می‌زند — ری‌استارت نمی‌کند و به کسی خبر نمی‌دهد. اگر اپ یا Postgres بیفتد، Caddy یک صفحهٔ ۵۰۲ خام و بی‌برند می‌دهد تا وقتی یک انسان اتفاقی سایت را باز کند.

**پیشنهاد:** (۱) در GlitchTip یک uptime monitor برای `https://ahantime.com/api/health` بسازید. (۲) `ai-smoke.yml:28` را به `https://ahantime.com` تغییر دهید.
**چرا فیکس نکردم:** بازهدف‌گذاری canary بلافاصله شروع به قرمزشدن می‌کند — که دقیقاً هدف است، ولی باید منتظرش باشید.

---

### 🟡 MEDIUM · `/api/health` هرگز Redis را چک نمی‌کند
**حوزه ۲۴** · `web/src/app/api/health/route.ts:24-35`

چک Postgres واقعی است (`SELECT 1` با ۵۰۳ در خطا). ولی Redis هرگز بررسی نمی‌شود، و Redis **منبع معتبر rate limiting** است. اگر بعد از بوت بمیرد، `redisRateCheck` مقدار null می‌دهد، کد بی‌صدا به پنجرهٔ درون‌پروسه برمی‌گردد، health همچنان ۲۰۰ می‌دهد — و rate limiting بی‌سروصدا بسیار ضعیف‌تر شده است.

**پیشنهاد:** یک probe غیرکشنده اضافه کنید که `redis: 'up'|'down'` را در بدنه گزارش کند **بدون** تغییر وضعیت HTTP.
**چرا فیکس نکردم:** ⚠️ **Redis را ۵۰۳ نکنید.** این کانتینر را روی خرابی کش unhealthy می‌کند — خرابی‌ای که اپ عمداً برای بقا در آن طراحی شده — و هر orchestrator آینده یک کانتینر سالم را می‌کشد.

---

## ۱.۴ — منطق مالی و پیش‌فاکتور

### 🟠 HIGH · واحد ارسالی کلاینت با واحد خودِ SKU تطبیق داده نمی‌شود
**حوزه ۲۵** · `web/src/lib/validation/api.ts:37` و `web/src/lib/server/services/leads.service.ts:286-306`

همه‌چیز دربارهٔ قیمت درست سمت سرور بازمحاسبه می‌شود — **جز واحد**، که مورد اعتماد قرار می‌گیرد. `catalog.ts:83` ثابت می‌کند SKU واحد معتبر خودش را دارد و هرگز با `item.unit` مقایسه نمی‌شود.

**سناریو:** درخواستی با `{skuId:'rebar-14', qty:100, unit:'branch'}` برای SKU ای که **کیلویی** ۴۲٬۰۰۰ تومان است → `lineTotal = 100 × 42,000 = 4,200,000` روی یک پیش‌فاکتور واقعی و صادرشده که می‌نویسد «۱۰۰ شاخه × ۴۲٬۰۰۰ تومان». ۱۰۰ شاخه میلگرد ۱۴ حدود ۱۲۰۰ کیلوست ≈ ۵۰٬۰۰۰٬۰۰۰ تومان. **حدود ۱۲ برابر کم‌قیمت‌دهی** روی سندی که مشتری در دست دارد و برایش پیامک شده. خطای معکوس هم `weightKg` را خراب می‌کند.

**پیشنهاد:** در `priceItems` واحد کلاینت را کاملاً نادیده بگیرید و از `hit.sku.unit` استفاده کنید؛ در صورت اختلاف، آیتم را با خطای صریح رد کنید. چک عدد صحیح `WHOLE_PIECE_UNITS` را هم به مسیر ایجاد اضافه کنید، نه فقط ویرایش ادمین.
**چرا فیکس نکردم:** ⚠️ **منطق مالی — قلمرو صریح مالک.** محاسبهٔ قیمت و وزن روی پیش‌فاکتور را بدون تأیید شما دست نمی‌زنم.

---

### 🟡 MEDIUM · هیچ سقف هزینه‌ای برای relay‏ DeepSeek نیست
**حوزه ۲۹** · `web/src/app/api/ai/chat/route.ts:81`

`limit: 10, windowMs: 5min` یعنی ۲۸۸۰ درخواست در روز از یک IP. `aiUsageRepo` توکن‌ها را ثبت می‌کند ولی **هیچ‌جا آن را نمی‌خواند** تا بودجه‌ای اعمال کند — جدول فقط گزارشی است. اینکه relay امروز روی HTTP 402 است دقیقاً همان خرابی‌ای است که نبودِ سقف تولید می‌کند.

**پیشنهاد:** بودجهٔ روزانهٔ توکن بر اساس `aiUsage` قبل از فراخوانی relay.
**چرا فیکس نکردم:** آنچه به یک ارائه‌دهندهٔ پولی می‌رسد را تغییر می‌دهد و می‌تواند کاربر را وسط گفتگو ببندد.

---

## ۱.۵ — حریم خصوصی و انطباق قانونی

### 🟠 HIGH · سیاست حریم خصوصی اصلاً مشاور هوش مصنوعی را افشا نمی‌کند، و نام ارائه‌دهندهٔ پیامک اشتباه است
**حوزه ۲۶** · `web/src/app/privacy/page.tsx:30-122`

جستجوی کل فایل برای `DeepSeek|هوش مصنوعی|خارج|ایران|کوکی|Matomo` → **صفر نتیجه**.

**پاسخ قطعی به سؤال:** خیر — سیاست افشا نمی‌کند که دادهٔ گفتگوی کاربر از طریق relay‏ DeepSeek از ایران خارج می‌شود. اصلاً وجود مشاور AI را افشا نمی‌کند. و PII اثباتاً به آن relay می‌رسد: `aiTools.ts:115-157` ابزار `create_lead` را تعریف می‌کند که آرگومان‌هایش `mobile: /^09\d{9}$/` به‌علاوهٔ `name` است.

ضمناً سیاست **کاوه‌نگار** را به‌عنوان پردازشگر پیامک نام می‌برد، در حالی که ارائه‌دهندهٔ واقعی و قفل‌شدهٔ مالک **SMS.ir** است (`smsir.ts:142` → `api.sms.ir`). کاربری که حقوقش را مطالبه کند، به شرکتی ارجاع داده می‌شود که هرگز شماره‌اش را نگرفته.

**پیشنهاد:** بخش «هوش مصنوعی و پردازش برون‌مرزی» اضافه شود؛ کاوه‌نگار → SMS.ir اصلاح شود.
**چرا فیکس نکردم:** متن حقوقی است، نه تغییر کد. جملهٔ انتقال برون‌مرزی مخصوصاً باید تأیید شما/مشاور حقوقی را داشته باشد.

---

### 🟡 MEDIUM · Matomo بدون بنر رضایت و بدون ناشناس‌سازی IP اجرا می‌شود
**حوزه ۲۶** · `web/src/app/api/analytics/script/route.ts:29-34`

نه `disableCookies`، نه `setDoNotTrack`، و هیچ کامپوننت بنر رضایتی در کد نیست. Matomo روی هر بازدیدکننده کوکی ردیابی first-party می‌گذارد، و سیاست حریم خصوصی هرگز کوکی یا آنالیتیکس را ذکر نمی‌کند. **تخفیف‌دهنده:** self-hosted و هم‌مبدأ پروکسی‌شده، پس چیزی از دامنه خارج نمی‌شود — مسئله افشا/مقرراتی است نه خروج داده.

**پیشنهاد:** `_paq.push(['disableCookies'])` (حالت بدون کوکی، بنر لازم نمی‌شود) — ساده‌ترین مسیر با توجه به پروکسی هم‌مبدأ.
**چرا فیکس نکردم:** `disableCookies` معنای شمارش بازدیدکننده را در گزارش‌های تاریخی Matomo عوض می‌کند، و متن سیاست حقوقی است.

---

## ۱.۶ — سئو (کسب‌وکاری‌ترین دستهٔ باقی‌مانده)

| # | یافته | چرا فیکس نکردم |
|---|---|---|
| 🟠 HIGH | **سه زبان از چهار زبان ساختاراً ایندکس‌ناپذیرند.** `LOCALES=['fa','en','ar','zh']` با چهار کاتالوگ کامل و یک `LocaleSwitcher` زنده در هدر و فوتر — ولی locale فقط سمت کلاینت حل می‌شود. `Accept-Language: en-US` هم `<html lang="fa" dir="rtl">` و عنوان فارسی می‌گیرد. هیچ URL مخصوص زبان، هیچ `hreflang`. en/ar/zh **هیچ URL ندارند** و نمی‌توانند رتبه بگیرند. | مهاجرت به سگمنت `[locale]` هر URL ایندکس‌شده را بازساختاردهی می‌کند |
| 🟠 HIGH | **کاتالوگ پیام حدود ۱۰٪ رابط را پوشش می‌دهد** (۱۰ namespace در برابر ۱۳۸ از ۱۶۸ کامپوننت با متن فارسی هاردکد). انتخاب انگلیسی = چیدمان LTR پر از متن فارسی. | تصمیم محصول: یا آستانهٔ کامل‌بودن، یا استخراج تدریجی |
| 🟠 HIGH | **اسلاگ‌ها ترانویسی بدون واکه‌اند:** `vrgh-grm`, `shyralat-snaty`, `flnj-v-atsalat`. خریدار فارسی «قیمت ورق گرم» جستجو می‌کند؛ `vrgh-grm` با هیچ عبارتی که انسان تایپ کند تطبیق نمی‌کند. بزرگ‌ترین شکاف ساختاری بین نقشهٔ سئوی مستند و آنچه زنده است. | تغییر URLهای ایندکس‌شده — بدون ۳۰۸ redirect برای هرکدام، رتبه از دست می‌رود |
| 🟠 HIGH | **صفحات SKU فقط برای ۳ دسته از ۱۴ وجود دارند** (۷۳ URL: ۳۸ pipe، ۲۷ wire، ۸ rebar؛ صفر برای یازده دستهٔ دیگر). لایهٔ long-tail که کل معماری SSR/ISR برای آن انتخاب شد ~۸۰٪ غایب است. | باید مشخص شود دادهٔ کاتالوگ ناقص است یا شکاف `generateStaticParams` |
| 🟡 MEDIUM | **هر روت داینامیک برای اسلاگ ناموجود کد ۲۰۰ می‌دهد** و صفحهٔ شبح را ~۳۶۵ روز کش می‌کند. `noindex` دارند (پس ایندکس نمی‌شوند) ولی Search Console آن‌ها را Soft 404 گزارش می‌کند و crawl budget می‌سوزد. | یک باگ در حل اسلاگ، SKUهای زنده را hard-404 می‌کند |
| 🟡 MEDIUM | **`Offer` با `price`/`availability: InStock` روی سایتی بدون خرید آنلاین.** `availability` هر وقت `p.available` دقیقاً `false` نباشد به `InStock` پیش‌فرض می‌شود. محرک کلاسیک «Structured data mismatch» که rich resultها را سایت‌وایـد حذف می‌کند. | تصمیم محصول دربارهٔ اینکه اصلاً `Offer` صادر شود یا نه |
| 🟡 MEDIUM | **جدول قیمت سمت کلاینت رندر می‌شود؛ حداقل یک زیردسته صفر ردیف در HTML سرور دارد.** `/prices/vrgh-grm/vrgh-syah` → `<tr>` صفر، در حالی که ۹ بار «تومان» در payload دارد. `/prices/rebar/deformed` درست رندر می‌شود. ناسازگار بین دسته‌ها. | ابتدا باید علت ریشه‌ای (داده یا `generateStaticParams`) تشخیص داده شود |

---

## ۱.۷ — کارایی و دیتابیس

| # | یافته | چرا فیکس نکردم |
|---|---|---|
| 🟠 HIGH | **هر ذخیرهٔ گروهی قیمت ادمین، ارزیابی نامحدود هشدارها را با یک رفت‌وبرگشت SMS همگام به‌ازای هر هشدار تریگر می‌کند.** ذخیرهٔ ۵۰۰ SKU می‌تواند هزاران هشدار را هم‌زمان رد کند؛ با ~۱ ثانیه به‌ازای هر SMS.ir یعنی ~۸ دقیقه کار در `after()` با نگه‌داشتن یک اتصال pool، در حالی که job خودش هر ۶۰ ثانیه هم تیک می‌زند — دو ارزیابی‌کنندهٔ هم‌پوشان. | ترتیب و زمان‌بندی ارسال یک اعلان مشتری‌رو را تغییر می‌دهد؛ مسیر `claimAlertForTrigger` باید دقیقاً حفظ شود |
| 🟡 MEDIUM | **۱۶ کلید خارجی ایندکس پوششی ندارند** + **۴ اندپوینت لیست ادمین روی ستون مرتب‌سازی/فیلترشان ایندکس ندارند** + **۴ ستون تاریخ داشبورد آنالیتیکس ایندکس ندارند** (~۲۰ کوئری seq-scan به‌ازای هر بارگذاری). امروز جداول کوچک‌اند؛ با رشد بد می‌شود. `sms_log` سریع‌ترین جدول در حال رشد است و job پاک‌سازی ساعتی روی ستون بدون ایندکس اجرا می‌شود. | ⚠️ **هیچ‌کدام از ۲۷ migration موجود از `CONCURRENTLY` استفاده نمی‌کنند.** یک `CREATE INDEX` ساده نوشتن روی جدول را قفل می‌کند. نیاز به migration دستی غیرتراکنشی دارد |
| 🟡 MEDIUM | **۱۴ اندپوینت لیست ادمین صفحه‌بندی `OFFSET` + `COUNT(*)` کامل در هر بارگذاری دارند.** صفحهٔ ۲۰۰ لیدها ۲۰۰ برابر صفحهٔ ۱ هزینه دارد. الگوی درست (keyset) از قبل در `auditRepo.ts:97-126` و `aiReviewRepo.ts` وجود دارد. | قرارداد API ادمین را عوض می‌کند (شمارهٔ صفحه → cursor) و رابط کاربری را با خودش |
| 🟡 MEDIUM | **API عمومی قیمت `s-maxage=120, stale-while-revalidate=300` می‌فرستد و ذخیرهٔ قیمت ادمین آن را باطل نمی‌کند.** یک کلاینت یا پروکسی می‌تواند تا **۴۲۰ ثانیه** بعد از اصلاح قیمت، جدول کامل قدیمی را سرو کند. صفحات ISR درست باطل می‌شوند؛ این مسیر API سوراخ است. | مصالحهٔ کش/دقت قیمت که کاربر می‌بیند — قیمت‌گذاری تصمیم قفل‌شدهٔ محصول است |
| 🟡 MEDIUM | **پاک‌سازی ساعتی از `NOT IN` روی زیرکوئری نامحدود روی `market_points` استفاده می‌کند.** هر ساعت کل تاریخچهٔ >۴۸ ساعته را دوباره اسکن می‌کند. | ⚠️ داده حذف می‌کند — یک بازنویسی اشتباه بی‌صدا تاریخچهٔ ticker را نابود می‌کند |
| 🔵 LOW | `users.referred_by` یک شناسهٔ کاربر بدون کلید خارجی است (تنها استثنا در schema) | افزودن FK به جدول زنده قفل می‌گیرد و در صورت وجود رکورد یتیم شکست می‌خورد |
| 🔵 LOW | `price_points` بی‌نهایت رشد می‌کند (~۸۹ هزار ردیف در سال) | **WONTFIX** — طبق spec عمدی است (`HISTORY_RETENTION unlimited`)؛ ایندکس خواندن را سریع نگه می‌دارد |
| 🔵 LOW | `0021_snapshot.json` غایب است (migration دست‌نویس) | **WONTFIX** — زنجیرهٔ `prevId` سالم است و drift صفر است؛ ساختن آن زنجیره را می‌شکند |

---

## ۱.۸ — احراز هویت و جلسه

### 🟡 MEDIUM · تشخیص استفادهٔ مجدد refresh token وجود ندارد
**حوزه ۲** · `web/src/lib/auth/service.ts:229-246`

`AUTH.md` ادعا می‌کرد «reuse fails and clears the session». فقط نیمهٔ اول درست است. جدول `refresh_tokens` ستون family/parent ندارد، پس یک توکن ارائه‌شده‌ولی‌قبلاً‌چرخیده از توکنی که هرگز وجود نداشته قابل تشخیص نیست — هر دو ۴۰۱ می‌گیرند. مهاجم توکن دزدیده را اول استفاده می‌کند و یک جلسهٔ خودتمدیدشوندهٔ ۳۰ روزه دارد؛ قربانی به `/login` می‌رود که از انقضای عادی قابل تشخیص نیست، و ورود مجدد **مهاجم را بیرون نمی‌کند**.

**چرا فیکس نکردم:** ⚠️ مسیری اضافه می‌کند که جلسات را دسته‌جمعی باطل می‌کند. یک باگ در heuristic (مثلاً ارسال دوگانهٔ تایمر silent-refresh که با خودش مسابقه بدهد) **کارکنان واقعی را لاگ‌اوت می‌کند**. نیاز به تحلیل race و بازبینی migration دارد.

### 🟡 MEDIUM · طول عمر access token چهار ساعت است، نه ۱۵ دقیقه‌ای که طراحی فرض می‌کند
**حوزه ۲** · `constants.ts:44`

پنجرهٔ ابطال برای مسیرهای فقط-JWT **۱۶ برابر** چیزی است که هر کامنت در کد دربارهٔ آن استدلال می‌کند (`session.ts:118` عیناً می‌نویسد «~15min access-token revocation window»). مرزهای مجوز خودشان درست محافظت شده‌اند (`requireApiPermission` → `getSessionVerified({strict:true})`)، به همین دلیل MEDIUM است نه HIGH. **مستندات را اصلاح کردم؛ خودِ مقدار را نه.**
**چرا فیکس نکردم:** کوتاه‌کردن TTL وابستگی به مسیر refresh/silent را زیاد می‌کند — همان چیزی که یک بار کارکنان را لاگ‌اوت کرد و به‌ازای هر ورود مجدد یک SMS هزینه گذاشت.

### 🟡 MEDIUM · شمارش شماره‌های کارکنان از طریق OTP پنل
**حوزه ۲** · `service.ts:64-72`

روی `panel.ahantime.com`، پاسخ `403 not_staff` در برابر `200` شماره‌های کارکنان را تمیز جدا می‌کند — و چک **قبل** از نوشتن هر وضعیت rate/OTP اجرا می‌شود، پس کاوش رایگان است و ردی نمی‌گذارد. (نیمهٔ عمومی، یعنی افشای `isNewUser`، `SAFE-TO-AUTOFIX` است و در بخش ۳ فهرست شده.)
**چرا فیکس نکردم:** ۴۰۳ متمایز یک انتخاب عمدی UX برای کارکنانی است که شماره‌شان را اشتباه می‌زنند. یکسان‌کردنش یعنی یک کارمند واقعاً غیرمجاز کادر ورود کد می‌گیرد که هرگز موفق نمی‌شود. **انتخاب شماست.**

---

## ۱.۹ — دسترسی‌پذیری، فرانت‌اند و بقیه

| # | یافته | چرا فیکس نکردم |
|---|---|---|
| 🟠 HIGH | **حاشیهٔ هر input/select/textarea نسبت کنتراست ۱.۲۲:۱ دارد** (لازم ۳:۱). فیلد هیچ مرز دیگری ندارد — کل فرم برای کاربر کم‌بینا فضای سفید خالی است. روی صفحهٔ ورود و فرم درخواست. | تغییر توکن طراحی — حاشیهٔ محسوساً تیره‌تر روی هر فیلد تصمیم بصری است |
| 🟠 HIGH | **نوار قیمت برای کاربران لمسی هیچ مکانیزم توقفی ندارد** (WCAG 2.2.2). تنها توقف `:hover`/`:focus-within` است. | مالک صریحاً دکمهٔ توقف را رد کرده (روی iOS مربع emoji شکسته می‌شد). با SVG حل می‌شود ولی تصمیم شماست |
| 🟠 HIGH | **یکی از جدول‌های قیمت عمومی عرض ثابت ۶۴۰px دارد بدون fallback کارتی و بدون هیچ media query.** روی موبایل ۳۲۰px یعنی اسکرول افقی ۲.۲ برابری برای خواندن یک قیمت. الگوی درست در `PriceTable` پیاده شده. | چیدمان موبایل جدید برای یک سطح پولی |
| 🟠 HIGH | `libphonenumber-js` حدود ۱۲۴KB متادیتای تلفن به bundle صفحهٔ ورود می‌فرستد — `/login` با ۲۲۸KB gzip سنگین‌ترین روت عمومی سایت است، برای صفحه‌ای با یک فیلد | `CountrySelect` فهرست کشورها را در اولین رنگ می‌سازد؛ lazy کردن نیاز به تصمیم دربارهٔ UI بازهٔ بارگذاری دارد |
| 🟠 HIGH | **Web Vitals در هر بارگذاری جمع و دور ریخته می‌شود.** `/api/vitals` بدنه را نمی‌خواند و ۲۰۴ برمی‌گرداند. بودجه‌های LCP/CLS در `CLAUDE.md` **اندازه‌گیری‌نشده**‌اند. | مسیر نوشتن روی یک اندپوینت عمومی احراز‌هویت‌نشده اضافه می‌کند؛ اول نیاز به rate limit دارد |
| 🟠 HIGH | **تمام شش تست RBAC در e2e روی `fixme` است** — مجوزدهی هیچ سیگنال end-to-end ندارد. مسدودکننده: `resolvePanelRouting` هدر Host خام را با یک hostname بدون پورت مقایسه می‌کند، پس `panel.ahantime.com:3100` تطبیق نمی‌کند | گیت دیده‌شدن ادمین را دست می‌زند — کل قرارداد «پنهان، نه ری‌دایرکت» به همین مقایسه بند است |
| 🟠 HIGH | **ماشین‌حساب‌های هزینه و پروژه از قیمت‌های ساختگی PRNG استفاده می‌کنند** (`/tools/cost`, `/tools/project` هر دو ۲۰۰ می‌دهند). | چیزی که به مشتری قیمت داده می‌شود را عوض می‌کند؛ نیاز به تصمیم محصول دربارهٔ نمایش وقتی قیمت زنده نیست |
| 🟡 MEDIUM | `preload="auto"` روی ویدیوی هیرو تا ۹۳۶KB را در پنجرهٔ LCP می‌کشد (موبایل خوب مدیریت شده، دسکتاپ نه) | مجاور فیکس‌های `7e3dbf6`/`2ce7c10` — هرکس آن تصمیم‌ها را گرفته باید تأیید کند |
| 🟡 MEDIUM | store‏های `requests`/`profile` بدون `skipHydration` به localStorage می‌روند → عدم تطابق hydration | افزودن `version: 1` به store بدون نسخه باعث می‌شود Zustand payload فعلی را دور بیندازد و **لیست درخواست هر کاربر فعلی پاک شود** — باید با `migrate` در همان تغییر بیاید |
| 🟡 MEDIUM | breakpointها desktop-first با ۲۵ مقدار مجزا و سه املا برای ۶۴۰px | ~۴۰ فایل CSS را دست می‌زند و چیدمان‌ها را جابه‌جا می‌کند |
| 🟡 MEDIUM | Matomo و MariaDB بدون `no-new-privileges`، `mem_limit`، `pids_limit` — تنها سرویسی که از دو مسیر عمومی در دسترس است | ری‌استارت کانتینر لازم دارد |
| 🟡 MEDIUM | کنسول ادمین Matomo روی ‏:8443 صفر هدر امنیتی دارد و نسخهٔ دقیق PHP/Apache را تبلیغ می‌کند | پیکربندی edge‏ Caddy؛ رابط Matomo داخلاً iframe استفاده می‌کند — `DENY` باید تست شود |
| 🔵 LOW | `Marquee` در اپ RTL با آفست فیزیکی `left` اسکرول می‌کند | نیاز به تأیید واقعی cross-engine دارد، نه ویرایش کورکورانه |
| 🔵 LOW | هر دو فونت فارسی با اولویت برابر preload می‌شوند (۱۲۵KB قبل از اولین رنگ) | subsetting بیشتر تایپوگرافی برند را تغییر می‌دهد و ریسک افتادن glyph (ZWNJ، ارقام tabular) دارد |
| 🔵 LOW | پول ادمین در تب پس‌زمینه ادامه می‌یابد | **WONTFIX** — تصمیم صریح محصول دربارهٔ تأخیر هشدار |
| 🔵 LOW | `restic forget --prune` بی‌صدا شکست می‌خورد؛ به‌روزرسانی dependencyهای dev (Vitest 2→3) | retention/pruning · ارتقای major که پیکربندی ۷۹ فایل تست را دست می‌زند |

---

# بخش ۲ — فیکس‌شده (۲۹ مورد، ۹ کامیت)

| کامیت | حوزه | چه چیزی |
|---|---|---|
| `3c896ea` | — | `CLAUDE.md` ساخته شد — معماری، استک، دام‌ها، مسیر دیپلوی، فهرست «هرگز انجام نده» |
| `fb5d036` | ۲۲ | **بکاپ برون‌سایتی که ۳ شب بی‌صدا شکست خورده بود تعمیر شد** · حجم `uploads` هم بکاپ می‌شود (تصاویر محصول که DB به آن‌ها اشاره می‌کند در هیچ بکاپی نبودند) · هر تگ forget جدا · اعتبارسنجی تازگی که شکست بی‌صدا را به خروج غیرصفر تبدیل می‌کند |
| `f3cc765` | ۸، ۲ | **دور زدن rate limit با `CF-Connecting-IP` بسته شد** · `DISABLE_RATE_LIMIT_FOR_TESTS` با `NODE_ENV` محافظت شد · تست‌ها به دو توپولوژی تفکیک شدند (۵/۵ سبز) |
| `4c6f75a` | ۱، ۲، ۳ | **دو open redirect** (`LoginForm`، `/api/auth/silent` با backslash) · **IDOR گفتگوی AI** · `assertSameOrigin` fail-closed · الگوریتم JWT پین شد · سوگیری `randomOtp` رفع شد |
| `92cab87` | ۱۸، ۱۶ | **قیمت‌های ساختگی بازار متوقف شد** (fallback فقط در حالت mock + empty state با retry) · **پیام circuit breaker دیگر ردیاب خطا را سیل نمی‌کند** (شمارنده به context رفت، فقط روی گذار گزارش) |
| `ac0db7a` | ۴ | **`perPage` روی شش کوئری لیست ادمین کلمپ شد** — `?perPage=5000000` کل جدول لیدها را در یک پاسخ می‌داد |
| `b5d2515` | ۱۳، ۱۴، ۱۵ | **تلهٔ کیبورد صفحهٔ اصلی حذف شد** · `crypto.randomUUID` محافظت شد (صفحهٔ سفید در Safari قدیمی) · توقف carousel روی focus · کنتراست برچسب ticker ‏(۲.۶۵:۱ → ۷.۲:۱) · `scroll-padding` برای WCAG 2.4.11 · `overflow-wrap` برای reflow · آخرین ویژگی جهت فیزیکی حذف شد |
| `aaf16dc` | ۵، ۶ | **مجوز دامپ‌های PII محدود شد** (۰۶۴۴ → ۰۶۰۰، در هر دو مسیر تولید، نه فقط فایل‌های موجود) · **میزبان پنل `noindex` شد** · `COOP`/`CORP` اضافه شد |
| `cc013f0` | ۱۹ | **مستنداتی که با اطمینان اشتباه بودند اصلاح شد** — از جمله خطای خودم در `CLAUDE.md` · چهار عدد امنیتی در `AUTH.md` · `ROUTING.md` و `ARCHITECTURE.md` علامت‌گذاری شدند · `PRODUCTION-AUDIT.md` به snapshot تبدیل شد · ۱۳ متغیر محیطی مستند شد |

**اعتبارسنجی:** `tsc --noEmit` تمیز · `stylelint` تمیز · تست‌های لمس‌شده سبز (`rateLimit` ۵/۵، `lib/auth` + `lib/server/utils` ۱۰۱/۱۰۱، `resilience` ۷/۷) · بکاپ به‌صورت زنده اجرا و تأیید شد.

---

# بخش ۳ — باز، بی‌خطر برای فیکس، هنوز اعمال‌نشده (۵۵ مورد)

اینها `SAFE-TO-AUTOFIX` هستند ولی به آن‌ها نرسیدم. به‌ترتیب ارزش:

**کارایی (حوزه ۹):** N+1 در `/api/admin/warehouse/settlements` (`Promise.all` بی‌سقف روی pool ده‌تایی — توقف یک worker، نه فقط صفحهٔ کند) · N+1 در `/search` (کل جدول قیمت هر دسته، دو بار) · N+1 در `/api/me/leads` و `/api/me/export` (۲ کوئری به‌ازای هر lead) · باطل‌سازی کش `ai:domain-facts` · jitter برای stampede در Redis · `escapeLike` در شش repo · تایپ‌های `sql.raw` در `analyticsRepo`

**رصدپذیری (حوزه ۱۶):** روت `/api/log` + `sendBeacon` (خطاهای سمت کلاینت **همه دور ریخته می‌شوند**) · برچسب release روی رویدادهای Sentry · `pricing.service.ts:174` متن خام استثنا را به کلاینت برمی‌گرداند · `redact()` فقط سطح اول را می‌پیماید · `scrubPii` مسیرهای pnpm را خراب می‌کند

**دسترسی‌پذیری (حوزه ۱۳-۱۵):** ARIA برای combobox `CountrySelect` (کاربر screen-reader نمی‌تواند کشور انتخاب کند) · `Suspense` بدون fallback در `/login` (صفحهٔ خالی تا hydration) · storage محافظت‌شده برای Safari private · safe-area افقی · `tabindex` روی نواحی اسکرول · Enter برای ارسال OTP · `aria-current` در هدر · aria گروه رادیویی · lookbehind در bundle ادمین · اهداف لمسی · توکن‌های تیرهٔ gain/loss

**سایر:** `isNewUser` از پاسخ OTP حذف شود · وزن فرمول در چهار جا تکرار شده (و **واگرا شده** — AI هشت شکل می‌شناسد، API چهار تا) · `ci.yml` با `NEXT_PUBLIC_API_MODE: mock` build می‌کند در حالی که پروداکشن `live` است · `TZ` در تست‌ها پین نشده · متا `robots` تکراری · `import 'server-only'` روی `sentry.ts` · پین کردن digest برای `glitchtip:latest` · SHA-pin کردن اکشن‌های GitHub · `git stash` قبل از `reset --hard` در deploy · همسان‌سازی HSTS · fallbackهای `color-mix`/`100vh` · `browserslist`

---

# بخش ۴ — آنچه واقعاً تمیز است

این کدبیس در بخش‌های زیادی از میانگین **بسیار** بالاتر است، و گفتنش منصفانه است:

- **ایمنی تایپ بهترین چیزی است که ایجنت‌ها در این اندازه دیده‌اند:** در ۷۰ هزار خط، **صفر** استفادهٔ واقعی از `any`، **صفر** `@ts-ignore`، `tsc` تمیز.
- **مجوزدهی قوی‌ترین بخش است.** هر ۷۸ هندلر `/api/admin/*` مجوز خودش را مستقل از middleware اعمال می‌کند. **هیچ IDOR ای در خانوادهٔ `/api/me/*` نبود** — هر ۱۶ هندلر هویت را از `session.id` می‌گیرند، نه از پارامتر. نقش `admin` فقط از طریق allowlist قابل دستیابی است، با محافظ آخرین-ادمین.
- **اعتبارسنجی ورودی:** ۶۹ از ۶۹ هندلر تغییردهنده validate می‌شوند. حذف پیش‌فرض شیء در Zod یعنی mass-assignment ممکن نیست. آپلود magic-byte را sniff می‌کند و نام فایل را خودش می‌سازد.
- **CSRF:** `assertSameOrigin` مرکزاً داخل `requireApiUser` اعمال می‌شود — هر ۶۵ روت تغییردهندهٔ احراز‌هویت‌شده پوشش دارند.
- **یکپارچگی migration بی‌نقص است:** هر ۲۷ ژورنال با `.sql` تطبیق دارند، هر ۲۷ هش SHA-256 بایت‌به‌بایت با ردیف‌های اعمال‌شده می‌خوانند، **drift صفر** بین کد و دیتابیس زنده.
- **مدیریت پول درست است:** هر ستون ارزی `bigint` تومان است، هرگز float. تنها ضرب در ۱۰ در کل کدبیس تبدیل IRR برای schema.org است و درست است.
- **پیش‌فاکتور یک snapshot واقعاً تغییرناپذیر است** — `findProformaByRef` هیچ قیمت‌گذاری مجددی نمی‌کند. refها قابل حدس نیستند (~۲۹.۴ بیت). idempotency روی هر دو مسیر ایجاد واقعی است.
- **شمارندهٔ تلاش OTP race ندارد** — `UPDATE ... RETURNING` اتمیک.
- **مدیریت PII در گزارش خطا با دقت ساخته شده:** دو لایه (نام کلید + الگوی مقدار)، روی پیام **و** stack، با پوشش ۱۰۰٪. **هیچ کد OTP یا توکنی به لاگ پروداکشن نمی‌رسد.** فقط ۵ فراخوانی `console.*` در کل `src/`.
- **بهداشت event listener عالی است:** هر ۱۳ کامپوننت/هوکی که listener، interval یا observer ثبت می‌کنند cleanup متناظر دارند — نشتی کلاسیک ticker/polling **وجود ندارد**.
- **جدول‌های قیمت نمونه‌وارند:** `<table>` واقعی با `<caption>`، `<th scope>`، `aria-sort`، wrapper اسکرول قابل‌دسترس با کیبورد، و تبدیل واقعی جدول→کارت در ۷۶۷px.
- **WCAG 1.4.1 کاملاً رعایت شده** — هر سبز/قرمز با یک فلش **و** یک کلمهٔ فارسی مخفی‌بصری همراه است.
- **جریان OTP معیار 3.3.8 را تمیز پاس می‌کند** — paste صریحاً پشتیبانی می‌شود، `autocomplete="one-time-code"`، بدون CAPTCHA.
- **متادیتای سئو کامل است** (هر ۴۵ صفحه)، canonicalها مطلق و صحیح‌اند و پارامترها را حذف می‌کنند، sitemap صفر مسیر noindex دارد و `lastModified` واقعی دارد، و تاریخ‌های ماشین‌خوان **میلادی ISO** هستند نه جلالی.
- **دقیقاً یک `href` هاردکد در ~۶۲۰ فایل** — چون همه‌چیز از `lib/routes.ts` عبور می‌کند، کل کلاس باگ «مسیر هاردکد ۴۰۴ می‌دهد» حذف شده.
- **هیچ سکرت زنده‌ای** در worktree، تاریخچهٔ گیت، یا bundle کلاینت نیست — با مقایسهٔ بایتی مقادیر واقعی کانتینر در حال اجرا با هر blob در `git rev-list --all` تأیید شد.
- **`scheduler.ts` نمونه‌وار است** (قفل advisory، بدون نگه‌داشتن تراکنش روی I/O شبکه، `unref()`)، و همین‌طور circuit breaker و توپولوژی healthcheck/`depends_on`.
- **مدیریت خطای SMS.ir بهترین در مخزن است:** timeout صریح، retry امن (timeoutها عمداً retry **نمی‌شوند** تا پیامک احتمالاً‌ارسال‌شده دوباره صورت‌حساب نشود)، circuit breaker، و شکست غیرکشنده.

---

## پیوست — تفکیک پوشش

| # | حوزه | یافته | فیکس | نیاز به تأیید |
|---|---|---:|---:|---:|
| ۱ | OWASP Top 10 | ۳ | ۲ | ۰ |
| ۲ | احراز هویت و session | ۸ | ۴ | ۳ |
| ۳ | کنترل دسترسی / IDOR | ۲ | ۱ | ۰ |
| ۴ | اعتبارسنجی ورودی | ۲ | ۱ | ۰ |
| ۵ | مدیریت secrets | ۴ | ۱ | ۱ |
| ۶ | TLS و هدرهای امنیتی | ۶ | ۲ | ۲ |
| ۷ | آسیب‌پذیری dependency | ۳ | ۰ | ۳ |
| ۸ | Rate limiting | ۳ | ۲ | ۰ |
| ۹ | کارایی بک‌اند | ۱۲ | ۰ | ۵ |
| ۱۰ | کارایی فرانت‌اند | ۴ | ۰ | ۴ |
| ۱۱ | تصاویر و asset | ۴ | ۰ | ۳ |
| ۱۲ | SEO فنی | ۶ | ۰ | ۵ |
| ۱۳ | دسترسی‌پذیری | ۱۲ | ۴ | ۴ |
| ۱۴ | ریسپانسیو و موبایل | ۶ | ۲ | ۳ |
| ۱۵ | سازگاری مرورگر | ۵ | ۱ | ۱ |
| ۱۶ | خطا، لاگ، مانیتورینگ | ۹ | ۱ | ۱ |
| ۱۷ | پوشش و کیفیت تست | ۴ | ۰ | ۱ |
| ۱۸ | کیفیت کد و معماری | ۵ | ۲ | ۲ |
| ۱۹ | مستندسازی | ۶ | ۶ | ۰ |
| ۲۰ | state و نشتی حافظه | ۴ | ۰ | ۲ |
| ۲۱ | schema و migration | ۵ | ۰ | ۳ |
| ۲۲ | backup و DR | ۵ | ۲ | ۲ |
| ۲۳ | CI/CD و محیط | ۷ | ۱ | ۳ |
| ۲۴ | uptime و health | ۴ | ۰ | ۳ |
| ۲۵ | صحت مالی و idempotency | ۲ | ۰ | ۱ |
| ۲۶ | حریم خصوصی و قانونی | ۳ | ۰ | ۲ |
| ۲۷ | لینک شکسته و ۴۰۴ | ۳ | ۰ | ۱ |
| ۲۸ | چندزبانگی | ۳ | ۱ | ۲ |
| ۲۹ | APIهای شخص ثالث | ۴ | ۰ | ۱ |
| ۳۰ | جریان‌های کاربری | ۴ | ۰ | ۰ |

*ارقام ستون‌های «فیکس» و «نیاز به تأیید» جمعشان با «یافته» برابر نیست — مابقی موارد `OPEN` (بی‌خطر ولی اعمال‌نشده) یا `WONTFIX` هستند.*
