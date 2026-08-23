# AGENT REPORT — استیل: «کارخانه» removed, «طول شاخه» published

**PR:** https://github.com/Am1eza/Iron/pull/237 · branch `worktree-steel-factory-length` · commit `d488721`
**Date:** 2026-08-23 (1405/06/01)
**Instruction (owner's employer):** «برای استیل‌ها چون که وارداتی هست باید کلاک کارخانه رو حذف بکنیم، فقط محصول رو می‌ذاریم، آلیاژش رو می‌نویسیم و طولش رو.»

---

## 1. Code changes

| File | Change |
|---|---|
| `web/src/lib/utils/catalogLabels.ts` | `factoryIsMeaningful()` returns `false` for `categorySlug === 'steel'`, unconditionally — no per-sub allow-list (unlike `profile`), because "imported" is true of every sub including the empty ones. `attrKeysFor('steel')` → `['alloy', 'branchLength']`, reusing the existing `ATTR_DEFS.branchLength` that پروفیل استیل already uses. |
| `web/src/lib/server/repos/catalogRepo.ts` | `publicCatalogPaths()` stops emitting `/prices/{cat}/factory/{f}` for a factory the catalog withholds. Query now also selects the SKU's own category + sub slug, and the check is asked exactly as `toPriceRow` asks it (own home, not the cross-listed target). |
| `web/src/app/prices/[category]/size/[size]/page.tsx` | «به تفکیک کارخانه» (metadata) and «در همهٔ کارخانه‌ها» (page description) are now conditional on `factoryIsMeaningful(category, null)`, matching what the sub-category page already did in #228. |
| `web/src/components/admin/catalog/SkuDrawer.tsx` | The name auto-fill no longer folds a withheld mill into the display name — otherwise an admin re-saving a steel row regenerates «نبشی استیل ۲۰×۲۰ چین» through the one field the DTO suppression cannot reach. Stored `factory` untouched. |
| `web/scripts/setSteelBranchLength.ts` (new) | The data fix — see §2. |
| `web/src/lib/utils/catalogLabels.test.ts` | استیل now asserts the column PAIR, the metres/«نامشخص» rendering, parity with پروفیل استیل's `branchLength`, and category-wide `factoryIsMeaningful === false`. |
| `web/src/components/catalog/PriceTable.steelFields.test.tsx` (new) | No factory column, no `<details>` sections, no jump-nav, no «محل تولید» fallback; «آلیاژ» + «طول شاخه» on every sub; «نامشخص» (never a dash) for an unfilled length. |
| `web/src/lib/server/repos/steelFactory.pg.test.ts` (new) | The DTO suppression itself; no region stand-in derived (a country is not an Iranian city); a same-named sub in another category keeps its real mill; `/prices/steel/factory/…` leaves `publicCatalogPaths` while `angle-channel`'s stays. |

### Downstream consistency check (item 5 of the brief) — all verified, none needed changes

- **`PriceTable.tsx`** — column, `<details>` sections, jump-nav, section count and sort control are all driven by `groupModeFor(rows)` off `row.factory`/`row.region`. With the factory withheld and «چین»/«تایوان» resolving to no Iranian city, `groupMode` falls to `none` and every one of them disappears together.
- **`SkuDetail.tsx`** — already goes through `attributeColumns()` and guards the «کارخانه» spec row and hero chip on `row.factory`. Its generic «طول شاخه» row is suppressed by `attrCoversLength`, so the length is printed once, not twice.
- **`BulkQuote.tsx`** — returns `null` when no row carries a mill; the «مقایسهٔ کارخانه‌ها» panel hides itself.
- **`FacetRail`** — returns `null` on an empty facet list, so both the category page's and the size page's factory rails vanish on their own.
- **`ExportMenu.tsx`** — already swaps the «کارخانه» CSV header via the same helpers.
- **`domainFacts.ts`** (AI advisor) — contains no factory reference at all; its grounding comes from `PriceRow`, so it follows the DTO.
- **`SkuDrawer.tsx`** — `branchLengthM` was already an editable field for every category, so the newly-displayed spec is already admin-editable; no new field needed. The «آلیاژ» relabel from #231 already covers the grade box.

---

## 2. Backfill — `web/scripts/setSteelBranchLength.ts`, applied to production

Dry-run first, then `--apply`, in one transaction.

| | Rows |
|---|---|
| `branch_length_m = 6` written | **55** (angle 5, channel 6, pipe 28, profile 16) |
| **Skipped** | **0** |
| Trailing origin word stripped from `name` | **11** (5 «… چین», 6 «… تایوان») |
| `skus.slug` changed | 0 — deliberately |
| `skus.factory` changed | 0 — suppressed at the DTO, kept for audit |
| `theoretical_weight_kg` changed | 0 — deliberately |

Post-write DB state:

```
slug    | n  | with_len | min | max | origin_in_name
angle   |  5 |        5 |   6 |   6 | 0
channel |  6 |        6 |   6 |   6 | 0
pipe    | 28 |       28 |   6 |   6 | 0
profile | 16 |       16 |   6 |   6 | 0
```

**Why nothing was skipped.** Every one of the 55 rows sanity-checked clean before the write: `unit = kg` and `price_basis = kg` on all of them, `branch_length_m` NULL on all of them, `theoretical_weight_kg` NULL on all of them, no `dimensions` set, and every name is a bar section (نبشی / ناودانی / لوله / پروفیل) — no coil, sheet, plate or fitting anywhere in the category's live stock. So there was nothing on file to contradict a straight 6 m bar.

**Why 6 m is evidence, not a guess.** It is the unexceptioned trade standard for imported stainless structural shapes, cross-checked against steelrokh.com across every نبشی استنلس size/thickness they list plus an independent check for لوله استیل. Their column layout for this exact product class is نام محصول / آلیاژ / سایز / ضخامت / طول (6 m) / وزن شاخه / واحد / قیمت — with no factory field at all.

**Guards the script keeps anyway** (so a future run cannot force it): an explicit bar-section allow-list (`angle`, `channel`, `pipe`, `profile` — a فلنج or رینگ has no branch length at all, and استیل's other, currently-empty subs are excluded by construction), plus per-row skips, reported never overwritten, for a coil/sheet/plate word in the name, a `price_basis`/`unit` of کلاف/برگ/متر مربع, or an already-set `branch_length_m` (an admin's own number always wins).

**Why the weight was left NULL.** This repo's rule since the 185-wrong-weights incident: a weight is written only when the section table AND the branch length are both published. There is no section table for imported stainless, so these rows keep an empty weight until someone has real numbers.

**Why the slugs were left alone.** `steel-angle-20x20-304-chyn` etc. are URLs, not labels. Renaming eleven of them would 404 every indexed product page and every inbound link, to fix a string no visitor reads.

---

## 3. Live verification

The production DB already has the data half; the code half ships with the PR. To verify both together before merge, the exact `next build` output of this branch was run against the **live production database and Redis** (a throwaway container on `ahantime_default`, `NODE_ENV=production`, `SEED_ON_START=false`; removed afterwards) and every page fetched over HTTP.

| Path | HTTP | «کارخانه» | «چین» | «تایوان» | «محل تولید» | «طول شاخه» | «۶ متر» | «آلیاژ» |
|---|---|---|---|---|---|---|---|---|
| `/prices/steel` | 200 | 2* | 0 | 0 | 0 | 56 | 112 | 58 |
| `/prices/steel/angle` | 200 | 2* | 0 | 0 | 0 | 6 | 12 | 8 |
| `/prices/steel/channel` | 200 | 2* | 0 | 0 | 0 | 7 | 14 | 9 |
| `/prices/steel/pipe` | 200 | 2* | 0 | 0 | 0 | 29 | 58 | 31 |
| `/prices/steel/profile` | 200 | 2* | 0 | 0 | 0 | 17 | 34 | 19 |
| `/prices/steel/angle/steel-angle-20x20-304-chyn` (spec sheet) | 200 | 2* | 0 | — | 0 | 2 | 4 | 4 |

\* **The two remaining «کارخانه» hits are not on the page's own content.** Both are the same sentence inside the site-wide products mega-menu, describing the *میلگرد* category («…قیمت هر کیلوگرم بر پایهٔ سایز و کارخانه اعلام می‌شود»), which is correct and untouched. Confirmed by dumping the surrounding markup. Nothing in the steel table, header copy, sort control, section headings or spec sheet says «کارخانه».

Also confirmed:

- `/prices/steel/factory/chyn` → **404** (it would previously have been a live page).
- `sitemap.xml` contains **0** `/prices/steel/factory/*` URLs.
- Live route slugs are exactly `angle` / `channel` / `pipe` / `profile` under `/prices/steel` — the استیل «پروفیل» sub is `/prices/steel/profile`, distinct from the top-level `/prices/profile/prvfyl-astyl`.
- «آلیاژ» from #231 still renders (۳۰۴ / ۳۰۴L / ۳۱۶L / ۲۰۱) — unchanged.
- «۶ متر» appears on every row of every one of the four subs (the count is 2× the row count because each row renders it in both the desktop cell and the mobile card).

### Not fixed here (pre-existing, out of scope)

The sub-category page's H1 sub-title reads «قیمت لحظه‌ای **نبشی استیل استیل** به تفکیک سایز» — the template is `${subName} ${categoryName}` and both already contain the word «استیل». It predates this change and affects every استیل sub equally. Worth a separate one-line fix; flagged rather than silently bundled.

---

## 4. Quality gates

- `tsc --noEmit` — clean for every touched file. (Three pre-existing `Cannot find module '…/ahantime-logo.png'` errors appear in a fresh worktree because Next's generated image type declarations are not checked in; unrelated to this change and absent from `next build`.)
- `next lint` on all touched files — clean (one pre-existing `_catOrder` unused-var warning in `catalogRepo.ts`).
- Full `next build` in Docker — green.
- Targeted Vitest: `catalogLabels`, `catalogCompose`, `PriceTable.*` (all 17 files in `components/catalog`), `admin/catalog`, `server/seo`, `profileFactory.pg`, `steelFactory.pg` — **184 + 13 passed**. The full suite is left to CI per the OOM constraint on this box.
- CI on the PR: `checks` **pass** (5m56s), `e2e` **pass** (3m30s). `Workers Builds: ahantime` is red, which is the known pre-existing failure on `main` (CLAUDE.md §5).

**PR is open, not a draft, ready for review. Not merged.**
