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
