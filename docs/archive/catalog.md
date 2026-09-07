# Historical reports — catalog

These are historical snapshots, consolidated on 2026-09-06. Deployment, test, price and open-item claims apply to their original reporting context, not the current system. Original report bodies and decisions are retained; verify operational commands against the current runbooks before use.

[Documentation index](../README.md)

## Reports
- [AGENT_REPORT_pipe_price_verification.md](#agent-report-pipe-price-verification)
- [AGENT_REPORT_profile_fields.md](#agent-report-profile-fields)
- [AGENT_REPORT_profile_slug_cleanup.md](#agent-report-profile-slug-cleanup)
- [AGENT_REPORT_seed_data_prices_fix.md](#agent-report-seed-data-prices-fix)
- [AGENT_REPORT_steel_factory_length.md](#agent-report-steel-factory-length)
- [CATALOG_GAP_FIX_REPORT.md](#catalog-gap-fix-report)
- [CATALOG_OWNER_DECISIONS_REPORT.md](#catalog-owner-decisions-report)
- [audit-catalog-C.md](#audit-catalog-c)

---

<a id="agent-report-pipe-price-verification"></a>

## Source: `AGENT_REPORT_pipe_price_verification.md`

# Pipe price verification — is ahantime.com "cheapest لوله in the market"?

**Verdict: NO. The unscoped claim «ارزان‌ترین لوله» is false and must not be published.**

Of nine pipe sub-types with active priced SKUs, exactly **one** (لوله جدار چاه) is
cheapest against every competitor checked. Three are tied or more expensive on live
evidence, and **five sub-types (21 SKUs) have no valid price of our own at all** — they
are still serving synthetic seed data from 2026-07-07.

- Research window: **2026-08-23 13:26–13:31 UTC** (= 1405/06/01)
- All competitor pages fetched live over HTTP from this host and parsed from the
  rendered tables. No search-engine snippets were used as evidence.
- All figures below are **تومان per kilogram, ex-VAT**, normalised to match our own
  `current_prices` convention (`vat_included = false`). Conversions are shown.

---

## 1. Findings that block the claim outright

### 1.1 — 21 of 67 active pipe SKUs are serving synthetic seed prices

Five sub-types are frozen at 2026-07-07 at 45,550–51,800 T/kg, while every
genuinely-priced pipe SKU sits at 103,909–256,635 T/kg.

`price_points` for `لوله صنعتی درزدار ۱ اینچ` shows the tell: a smooth daily
random walk (45,911 → 49,100 across 2026-05-30 → 2026-07-07), then nothing for
43 days, then a hard jump to 109,410 on 2026-08-19 when a real price was entered.
That daily-jitter series is generated seed data, not admin-entered market prices.

The same 2026-07-07 boundary and the same ~2.2× discontinuity appear in all five:

| Sub-type | SKUs on seed data | Seed range (T/kg) | Real market level today |
|---|---:|---|---|
| لوله مانیسمان داخلی | 5 | 48,200 – 51,800 | ≈170,000–181,000 (derived, §3.6) |
| گازی | 5 | 48,750 – 50,500 | — |
| مبلی | 4 | 48,100 – 50,750 | — |
| صنعتی درزدار | 3 of 5 | 49,800 – 51,650 | ≈104,545 (esfahanahan) |
| گالوانیزه | 4 of 6 | 45,550 – 48,750 | ≈168,727–172,363 (ahanprice) |

Within a single sub-type the two eras sit side by side: `لوله صنعتی درزدار ۱ اینچ`
= 109,410 (real, 2026-08-19) but `۱¼ اینچ` = 49,800 (seed) — adjacent sizes 2.2× apart.
`گالوانیزه ۲½` = 199,832 but `گالوانیزه ۳` = 47,700, a 4× gap.

**Consequence.** These SKUs *look* dramatically cheapest — our `لوله مانیسمان ۳ اینچ`
implies 49,050 × 67.7 kg = **3,320,685 T/branch** against ahanonline's اهواز رده-40
3″ at **11,472,273 T/branch** (3.45× cheaper). That is not a price advantage; it is a
stale seed number at roughly 29% of market. Advertising on it would mean either
honouring an unprofitable quote or visibly failing to honour a published price.
Fixing these 21 prices is a prerequisite to any claim, cheapest or otherwise.

### 1.2 — Our headline "cheap" prices are mirrored from a competitor, not undercutting it

`price_sync_entries` shows only **3 pipe writes ever**, all the same SKU, all
`write:exact` from **ahanonline** — our own price-sync source:

```
لوله گالوانیزه ۲½ اینچ ← «لوله گالوانیزه تست آب ضخامت 3 میل سایز 2 1/2 اینچ ساوه»
199,832 T/kg · source_updated_at 1405/5/31 · applied 2026-08-23
```

Every other pipe SKU was skipped by the matcher (60 fuzzy, 51 uncertain, 48 no-size-match).
And لوله گوشت‌دار is **byte-identical to ahanonline across all 8 SKUs**
(243,759 / 256,635 vs their 243,759 / 256,636). A mirrored price is by definition
not a cheaper price.

---

## 2. Evidence table

Sources, all fetched 2026-08-23 13:26–13:31 UTC:

| # | Source | URL | Publisher stamp | Unit convention |
|---|---|---|---|---|
| S1 | ahanonline.com | `https://ahanonline.com/product-category/انواع-لوله/…` (8 pages) | 1405/5/31 | `data-price` in **ریال**, ÷10 → تومان, ex-VAT |
| S2 | esfahanahan.com | `https://esfahanahan.com/لوله/` + 4 `/product/` pages | 1405/5/31 12:34 | **ریال/kg incl. 10% VAT** → ÷10÷1.1 |
| S3 | ahanprice.com | `https://ahanprice.com/Price/لوله-{جدار-چاه,اسپیرال,داربستی,گالوانیزه,مانیسمان}` | 1405/06/01 | تومان/kg, page states «بدون احتساب … افزوده» = ex-VAT |
| S4 | ahan1.com | `https://ahan1.com/Category/pipe/{scaffolding,spiral}-pipe/` | 1405/05/28, 1405/05/12 | تومان/kg, ex-VAT (VAT is a toggle) |
| S5 | ahanjam.com | `https://ahanjam.com/لوله-{جداره-چاه,داربستی}/` | 1405/05/24 | تومان/kg, shows ex-VAT and incl-VAT pair |

**Excluded:** `ahanmelal.com/metal-pipe/scaffolding-pipe-price` — HTTP 200 but carries an
empty «آخرین بروزرسانی:» field and quotes 74,500–75,000 T/kg, ~28% below every
dated source. Treated as stale, not counted. A Google snippet for the same page
returned a **1403** price (35,000 T/kg) — the stale-cache trap the brief warned about.
No competitor site timed out; all 14 fetches returned HTTP 200.

---

## 3. Verdict per sub-type

### 3.1 لوله جدار چاه (13 SKUs) — ✅ CHEAPEST

The only sub-type where we beat every brand-matched competitor quote.

| Spec | Ours | S3 ahanprice | S1 ahanonline | S5 ahanjam | S2 esfahanahan | Our margin |
|---|---:|---:|---:|---:|---:|---:|
| تهران شرق 8″ | **113,133** | — | 114,716 (4mm) | — | — | −1.38% |
| تهران شرق 10″ | **113,191** | 114,909 (6mm) / 115,000 (5mm) | 115,009 / 115,022 | — | — | −1.50% |
| تهران شرق 12–16″ | **113,168** | — | 114,952 / 115,022 | 115,000 | 114,091 (12″ 6mm) | −0.81% … −1.62% |
| کالوپ 8–10″ | **114,130** | 115,818 / 116,000 | 115,866 / 116,032 | — | — | −1.46% |
| کالوپ 12–14″ | **113,966** | 115,636 | 115,701 / 115,866 | — | — | −1.45% |
| کیان پرشیا 8–14″ | **114,400** | 116,181 | 116,218 | — | 114,091 | −1.53% but **+0.27% vs S2** |

Sample raw evidence:
- S3: «قیمت لوله جدار چاه 10 اینچ ضخامت 6 میل تهران شرق» = 114,909 تومان, تاریخ 1405/06/01
- S1: «لوله جدار چاه 4 8 اینچ تهران شرق st37 12 متری کارخانه» = 1,147,160 ریال → 114,716 تومان
- S2: «لوله جداره چاه 12 اینچ ضخامت 6 میل» = 1,255,000 ریال incl-VAT → 114,091 ex-VAT
- S5: «لوله جدار چاه (۸ اینچ …)» = 115,000 تومان ex-VAT / 126,500 incl-VAT

**Caveat, stated plainly:** our کیان پرشیا line at 114,400 is **0.27% above**
esfahanahan's 12″ quote. So "cheapest جدار چاه" is true for تهران شرق and کالوپ against
all five sources, and true for کیان پرشیا against four of five.

### 3.2 لوله اسپیرال (20 SKUs) — ❌ NOT CHEAPEST (tied, and beaten on نیزار)

| Mill | Ours | S4 ahan1 | S3 ahanprice | S1 ahanonline | Result |
|---|---:|---:|---:|---:|---|
| کالوپ | 112,818 | **112,818** | **112,818** | 114,636 | **exact tie** — not cheaper |
| نورد لوله و پوشش نیزار | 124,090 | 124,000 (اسپیرال قم) | **123,636** | 125,909 | **we are +0.37% more expensive** |

ahan1's کالوپ figure (112,818, stamped 1405/05/12) matches ours digit-for-digit, and
ahanprice's نیزار quote (123,636, 1405/05/31) undercuts ours. This directly refutes
the narrower fallback claim «ارزان‌ترین لوله اسپیرال».

### 3.3 لوله داربستی (1 SKU) — ❌ NOT CHEAPEST (five cheaper live quotes)

Ours: 103,909 T/kg (لوله سپاهان, 1½″).

| Competitor quote | Price | vs ours |
|---|---:|---:|
| S4 ahan1 — بنگاه اصفهان | **100,909** | we are +2.97% |
| S5 ahanjam — ورق اهوازی | **102,000** | +1.87% |
| S5 ahanjam — ورق فولاد مبارکه | **102,273** | +1.60% |
| S2 esfahanahan — ورق اهواز/گیلان (1,130,000 ریال incl-VAT) | **102,727** | +1.15% |
| S2 esfahanahan — ورق فولاد مبارکه (1,140,000 ریال incl-VAT) | **103,636** | +0.26% |
| S3 ahanprice — فولاد گستر حداد (cheapest of 9 brands) | 104,909 | −0.95% |
| S1 ahanonline — فولاد گستر حداد (cheapest of 5 brands) | 104,909 | −0.95% |

We beat the cheapest brand on two aggregators and lose to four other quotes. Note our
SKU is branded لوله سپاهان, which none of the five sources lists for داربستی — the
comparison is size/spec-matched (1½″, 2–3mm, 6m) but not brand-matched.

### 3.4 لوله گوشت‌دار (8 SKUs) — ⚪ TIED (mirrored)

Ours 243,759 / 256,635 vs S1 ahanonline 243,759 / 256,636. Identical to the rial.
No second source found publishing گوشت‌دار (ahanprice returns HTTP 404 for that
category). **Not cheaper; no independent corroboration.**

### 3.5 لوله گالوانیزه (2 real + 4 seed) — ❌ MORE EXPENSIVE

Ours: ۲½″ = 199,832 (mirrored from S1 exactly), ۶″ = 197,004.
S3 ahanprice روی پوشان, 1405/06/01: 2″ 2mm = 170,545 · 2½″ 2mm = 170,545 ·
3″ 2.5mm = 171,272 · 4″ 2.5mm = 169,454 · 5″ 3mm = 168,727.

At 2½″ we are **+17.2%** above ahanprice. Specs are not identical — ours is ساوه
«تست آب» 3mm, theirs is روی پوشان 2mm — so this is directional rather than exact,
but it is nowhere near a cheapest claim. The other 4 galvanized SKUs are seed data (§1.1).

### 3.6 لوله صنعتی درزدار (2 real + 3 seed) — ❌ MORE EXPENSIVE

Ours: 1″ = 109,410, 2″ = 111,440.
S2 esfahanahan «لوله صنعتی 1 اینچ ضخامت 1.8 میل» = 1,150,000 ریال incl-VAT
→ **104,545 ex-VAT**. We are **+4.65%**.

### 3.7 مانیسمان · گازی · مبلی (14 SKUs) — ⛔ NO VALID OWN PRICE

All on 2026-07-07 seed data (§1.1). Comparison is meaningless. For reference, real
مانیسمان today is quoted per-branch, not per-kg:
S1 اهواز رده-40 3″ = 11,472,273 T/branch · S3 same = 12,017,272 T/branch ·
S2 رده-80 3″ = 20,129,000 → 18,299,091 ex-VAT T/branch · S1 رده-80 3″ چین = 18,181,818.

Note our schema stores مانیسمان as `unit='kg'` while the whole market quotes per شاخه —
worth checking separately that the storefront converts correctly once real prices land.

---

## 4. The narrowest claim the evidence supports

The only defensible claim today is scoped to **one sub-type**:

> «ارزان‌ترین لوله جدار چاه بازار» — verified 1405/06/01 against ahanonline,
> esfahanahan, ahanprice, ahan1 and ahanjam, for برندهای تهران شرق و کالوپ.

Even this deserves three warnings before it is published:

1. **The margin is ~1.5%, on one day.** Competitor quotes moved 2,000–6,300 تومان/kg
   overnight on ahanprice's own «نوسان» column. A 1.5% lead can vanish before the ad
   copy ships. A standing "cheapest" claim needs a daily automated check, not a
   one-off audit.
2. **It excludes کیان پرشیا**, where esfahanahan is 0.27% below us.
3. **It covers 13 of 67 pipe SKUs (19%)** and a niche drilling product. It cannot
   carry a homepage-level «لوله» claim.

A safer, fully-defensible alternative that needs no daily policing: claim
**price transparency and delivery-time**, not price leadership — which is also what the
locked product positioning («اول مشورت، بعد خرید») already sells.

## 5. Recommended order of work

1. Replace the 21 seed prices (§1.1) with real admin-entered figures. Until then the
   public pipe pages are quoting ~29–50% of market on five sub-types — this is a
   live commercial exposure independent of any advertising claim.
2. Re-run this comparison after step 1; the picture for مانیسمان/گازی/گالوانیزه is
   currently unknown, not favourable.
3. Only then decide on a claim, and if one is made, scope it to جدار چاه with a
   dated «بررسی‌شده در تاریخ …» qualifier and an automated daily re-check.

---

*Raw fetched HTML and parsed JSON retained at `/root/.claude/jobs/bd0ed7b0/tmp/`
(`ao_*.html`, `es*.html`, `c_*.html`, `ao_rows.json`, `es_rows.json`, `price_rows.json`)
for the duration of this job. No site copy or code was modified.*

---

<a id="agent-report-profile-fields"></a>

## Source: `AGENT_REPORT_profile_fields.md`

# AGENT REPORT — پروفیل price pages rebuilt on ahanonline's model

**Date:** 1405/05/31 (2026-08-22) · **Branch:** `worktree-profile-fields` ·
**PR:** [#224](https://github.com/Am1eza/Iron/pull/224) ·
**Commit:** `5cba1d7` · **Worktree:** `/opt/ahantime/.claude/worktrees/profile-fields`

---

## 1 · What I kept from the retained worktree diff, and why

The uncommitted diff in `.claude/worktrees/profile-fields` was good and I built
on it rather than restarting. Kept **unchanged in mechanism**:

| Piece | Verdict |
|---|---|
| `factoryIsMeaningful(categorySlug, subCategorySlug)` + `PROFILE_NO_FACTORY_SUBS` in `catalogLabels.ts` | **Kept.** Right shape. Re-verified every slug in the set against the live DB — all six are the real active sub-category slugs (`prvfyl-snaty`, `profil-mobli`, `profil-sotuni`, `profil-galvanizeh`, `profil-z`, `prvfyl-astyl`), and `prvfyl-sakhtmany` is correctly excluded. |
| Suppression applied in `catalogRepo.toPriceRow` | **Kept.** One DTO boundary means table, cards, spec sheet, facet rail, sitemap, export and AI grounding agree for free — confirmed visually: the «قیمت پروفیل بر اساس کارخانه» facet rail present in the before shots is gone in the after shots without any change to that component. |
| `AttrKey`/`AttrColumn`/`attributeColumns` generalisation of the grade column | **Kept.** |
| `SkuDetail`, `SkuDrawer`, `BulkQuote` edits | **Kept.** `BulkQuote`'s «مقایسهٔ کارخانه‌ها» self-suppressing when no row has a mill is exactly right — visible in the before/after Z pair. |
| Tests `PriceTable.profileFields.test.tsx`, `profileFactory.pg.test.ts` | **Kept and extended.** |

**Changed:**

- `FactorySection` → `SectionShell`, `byFactory` → `bySection`, `showFactory` →
  a three-valued `groupMode` (`factory` \| `region` \| `none`). The retained
  diff's binary "factory or one flat table" could not express the region case.
- The `<details>` `id` stays `factory-section-${i}` and the `?factory=` deep
  link still resolves against it — renaming would have broken existing inbound
  links from the home hero board for no user-visible gain.
- `ExportMenu` — not touched by the retained diff. Its «کارخانه» column would
  have exported «نامشخص» on every پروفیل row; it now substitutes «محل تولید»
  (a substitution, never an extra column — the image export uses a fixed pixel
  grid).
- `SkuDetail` and the mobile price card gained a «محل تولید» line, so the fact
  the desktop table carries in a section heading is not lost on a phone or on
  the product page.

Nothing was discarded.

---

## 2 · The region reconstruction

`regionFromFactory()` (in `catalogLabels.ts`) recovers a producing city from
the *withheld* mill string by **whole-token** match against the freight city
list this repo already maintains — `src/lib/data/logistics.ts`'s `CITIES`
(16 cities, road distances from the Shadabad warehouse). I did not write a new
city list.

Whole tokens, not substrings: «قم» and «ساری» are substrings of many unrelated
Persian words, and a substring match would silently invent a region. ZWNJ
(U+200C) counts as a token boundary alongside whitespace.

> **This is a heuristic best-effort reconstruction from data the catalog
> already held — NOT scraped ahanonline data and NOT verified regional
> sourcing data.** That caveat is written into the JSDoc of
> `regionFromFactory`, of `SKU.region`, and of the `toPriceRow` branch that
> derives it, so a future reader cannot mistake it for sourced fact.

### Results per sub-category (live DB, active SKUs, verified 2026-08-22)

| Sub-category (slug) | Active rows | Resolved to a city | Coverage | Outcome |
|---|---:|---:|---:|---|
| پروفیل صنعتی `prvfyl-snaty` | 1 | 1 — اصفهان («صنعتی اصفهان») | 100 % | **region sections** — one «قیمت پروفیل اصفهان» |
| پروفیل ستونی `profil-sotuni` | 6 | 3 — مشهد ×2, تهران ×1 | 50 % | **region sections** — تهران · مشهد · نامشخص(3) |
| پروفیل Z `profil-z` | 7 | 4 — تهران ×2, مشهد ×2 | 57 % | **region sections** — تهران(2) · مشهد(2) · نامشخص(3) |
| پروفیل گالوانیزه `profil-galvanizeh` | 5 | 1 — اصفهان («پایا اصفهان») | 20 % | **flat fallback** + «محل تولید» column |
| پروفیل مبلی `profil-mobli` | 1 | 0 («نیکان پروفیل») | 0 % | **flat fallback**, no column |
| پروفیل ساختمانی `prvfyl-sakhtmany` | 0 | — | — | unchanged; keeps «کارخانه» by design |
| پروفیل استیل `prvfyl-astyl` | 0 | — | — | no priced stock (see §3) |

Names that resolved to nothing, all correctly: «نیکان پروفیل», «کیان پرشیا»,
«جهان پروفیل پارس», «پروفیل یاران», «پروفیل صابری».

### Why 50 %

`REGION_COVERAGE_MIN = 0.5`. Below it the page would be one large «نامشخص»
section plus a couple of one-row cities — a structure advertising a regional
story the data cannot tell. At 50 % the named sections carry at least as many
rows as the unknown bucket. گالوانیزه (20 %) is exactly the case this guards
against; its one resolved city survives as a **column** instead, so the fact
is not thrown away.

«نامشخص» always sorts last in region mode. Factory mode's «سایر» bucket is
deliberately **not** changed — it has ranked by cheapest-price among unplaced
mills since US-18.2 and `PriceTable.factoryOrder.test.tsx` asserts that. (My
first pass sank both buckets and broke that test; caught and scoped.)

---

## 3 · Attribute-column decision table — as specified, verified live

| Sub | Factory/region | Grade field | Verified in screenshot |
|---|---|---|---|
| صنعتی | region grouping | «گرید» → «طول شاخه» → **۶ متر** | ✅ `after-prvfyl-snaty.png` |
| ساختمانی | **factory kept** | unchanged | ✅ `after-prvfyl-sakhtmany.png` (0 rows) |
| مبلی | flat (0 resolved) | unchanged «گرید» | ✅ `after-profil-mobli.png` |
| ستونی | region grouping | unchanged «گرید» | ✅ `after-profil-sotuni.png` |
| گالوانیزه | flat + column | unchanged «گرید» | ✅ `after-profil-galvanizeh.png` |
| Z | region grouping | «گرید» → «طول سفارشی» → **بر اساس سفارش** | ✅ `after-profil-z.png` |
| استیل | region grouping | «آلیاژ» **+** «طول شاخه» (both) | code + unit test only — 0 rows live |

**Active استیل slug re-verified:** `prvfyl-astyl` (active, 0 SKUs).
`profil-steel` is **inactive** with 0 SKUs, and `prvfyl-snaty` is a distinct
sub-category, not the steel counterpart. The retained diff had this right.
The spec's "populate real 201/304/316 where known" could not be actioned:
there are no استیل SKUs at all to populate. The column set is in place and
unit-tested, and will render correctly the moment stock is added.

---

## 4 · SKU deactivations

**None were needed.** Re-checked against the live DB:

```sql
select sc.slug, s.size, count(*) from sub_categories sc
  join skus s on s.sub_category_id = sc.id
  join categories c on c.id = sc.category_id
 where c.slug='profile' and sc.is_active and s.is_active
 group by 1,2 having count(*) > 1;
-- 0 rows
```

No active پروفیل sub-category has two active SKUs at the same size, so there is
no cheapest-per-size contest to resolve. `profil-mobli` already had 4 of its 5
SKUs soft-deleted (`is_active = false`) by earlier work — `profile-furniture-32`,
`-33`, `-34`, `-35` — leaving `profile-furniture-31` (۶۰×۶۰) active. Nothing
was deactivated by this task, and no row was hard-deleted.

---

## 5 · Open items and findings (not fixed — needs an owner call)

### 5.1 · Three پروفیل sub-category URLs 308 to the category page

`redirects` carries active rows sending three sub-pages to `/prices/profile`:

| from | to | created |
|---|---|---|
| `/prices/profile/prvfyl-snaty` | `/prices/profile` | 2026-08-14 |
| `/prices/profile/prvfyl-sakhtmany` | `/prices/profile` | 2026-08-14 |
| `/prices/profile/prvfyl-astyl` | `/prices/profile` | 2026-08-14 |

They were created while those subs were empty. **`prvfyl-snaty` now has a live
priced SKU** (`profile-80x80`, ۱۰۸٬۱۸۲ ت/kg, `branch_length_m = 6`), so its
own page — the one this task's «طول شاخه» change is most visible on — is
unreachable. The content is still reachable through the sub-filter chip on
`/prices/profile`, which is how I did the visual QA.

I did **not** change this: the `redirects` table has no `is_active` column, so
removing a redirect means a `DELETE`, and CLAUDE.md §8 forbids deleting
production data unprompted. It also brushes against the standing note that
some empty sub-categories are deliberately live and empty.
**Recommendation:** delete the `prvfyl-snaty` row (it has real stock now);
decide `prvfyl-sakhtmany` / `prvfyl-astyl` alongside whether those subs are
meant to be publicly visible while empty.

### 5.2 · «محل تحویل» column — deliberately not added

ahanonline's «محل تحویل» reads «کارخانه» as an *ex-works delivery term*. This
repo has no per-SKU delivery-terms field, and its one authoritative delivery
fact points the other way: `logistics.ORIGIN_LABEL` is «انبار شادآباد تهران»
and `estimate.service.landedCost` prices every order as shipping from that
warehouse. A hardcoded «کارخانه» column would be a fresh fabrication replacing
the one this task removes, and a hardcoded «انبار» column adds nothing a buyer
does not already read in the freight panel. Adding it properly needs a
`delivery_terms` column and admin input — a schema change and an owner
decision, out of scope here.

### 5.3 · «نوسانات» — already present

No fake history was invented. The «نوسان» column / `MovementBadge` already
computes this; it is visible in every screenshot.

### 5.4 · Pre-existing data oddities noticed, not touched

- Most پروفیل Z / ستونی / گالوانیزه rows render «تماس بگیرید» because their
  prices are stale (last updated 04/16 and 05/28). Price-freshness behaviour,
  not a regression.
- `profil-galvanizeh` ۲۰×۲۰ is ۴۴٬۵۵۰ ت/kg against ~۱۷۲٬۷۲۷ for its siblings,
  and `profil-mobli` ۶۰×۶۰ is ۱۵۰٬۹۰۹ against ~۴۵٬۰۰۰ for its deactivated
  siblings. Both look like data-entry errors worth an admin review.
- Six پروفیل sub-categories with real priced stock are **inactive** and
  therefore invisible: `box-rect`(5), `box-square`(6), `chaharpahlu`(14),
  `chaharpahlu-alloy`(5), `congress`(6), `frame`(6) — 42 priced SKUs. Same
  pattern as the previously-recorded stranded-sub-category issue. Not touched.

---

## 6 · Screenshots

All in `.claude/worktrees/profile-fields/shots/` (untracked; 1440px viewport,
full page). `before-*` were taken against the live production container
through Caddy; `after-*` against a build of this branch wired to the **same
production database**, so any difference is the code, not the data.

| File | Shows |
|---|---|
| `before-profil-z.png` | «۷ کالا · ۵ کارخانه»; five fabricated mill sections («تهران شرق», «فولاد مشهد», «جهان پروفیل پارس», «پروفیل یاران», «پروفیل صابری»); «کارخانه» column; empty «گرید» column; «مقایسهٔ کارخانه‌ها» panel; «قیمت پروفیل بر اساس کارخانه» facet rail |
| `after-profil-z.png` | «۷ کالا · ۳ محل تولید»; quick-jump chips تهران/مشهد/نامشخص; three region sections with «نامشخص» last; «طول سفارشی» = «بر اساس سفارش»; no «کارخانه» anywhere; no mill-comparison panel; no factory facet rail |
| `before/after-prvfyl-snaty.png` | after: one «قیمت پروفیل اصفهان» section, «۱ کالا · ۱ محل تولید», «طول شاخه» = ۶ متر |
| `before/after-profil-sotuni.png` | after: تهران · مشهد · نامشخص sections, «گرید» kept |
| `before/after-profil-galvanizeh.png` | after: flat table, «محل تولید» column (اصفهان on ۸۰×۴۰, «نامشخص» on the rest), «گرید» kept |
| `before/after-profil-mobli.png` | after: flat table, no «محل تولید» column at all |
| `before/after-prvfyl-sakhtmany.png`, `*-prvfyl-astyl.png` | «۰ کالا» — unchanged, no priced stock |

---

## 7 · Verification

- `tsc --noEmit` — clean.
- `next lint` scoped to all 11 touched files — clean (only pre-existing
  repo-wide warnings in untouched files).
- Prettier reports the same formatting drift on `main` for these files, and
  Prettier is not in CI — left alone rather than mixing a reformat into this diff.
- No CSS changed, so no stylelint run was needed.
- **431 tests green** across `src/components/catalog`, `src/lib/server/repos`,
  `src/lib/utils`, `src/lib/seo`, `src/lib/server/catalog.test.ts`. Ran in
  Docker with a 4 GB cap, scoped by path — the full suite was **not** run on
  this box (documented OOM risk).
  - `PriceTable.profileFields.test.tsx` — 14 tests, 5 new for region grouping:
    sections + ordering, «محل تولید» naming of the count and the quick-jump nav,
    the flat fallback below threshold, the single-city section, and a real mill
    outranking region grouping in the mixed «همه» view.
  - `catalogLabels.test.ts` — new `regionFromFactory` (including the
    substring/ZWNJ cases), `groupModeFor`, `groupKeyFor` blocks.
  - `profileFactory.pg.test.ts` — 7 tests; three new assert the region is
    derived at the DTO boundary, that no row ever publishes both a mill and a
    region, and that a category which kept its factories gets no region.

---

## 8 · Deploy status — **LIVE**

- PR #224 CI: `checks` **pass** (4m37s), `e2e` **pass** (4m38s).
  `Workers Builds: ahantime` and `Deploy preview to GitHub Pages` failed — both
  are the documented pre-existing noise, red on `main` independently of any PR.
- Squash-merged to `main` as **`4f8b60e`** at 2026-08-22 22:43 UTC.
- `Deploy to production server` **failed on its first run**: `build` green (the
  image reached GHCR), `deploy` dead at the pull with
  `Get "https://ghcr.io/v2/": net/http: TLS handshake timeout`. Two manual
  `docker pull`s from this host then returned a *different* error —
  `error from registry: denied` — i.e. the stored GHCR credential in
  `/root/.docker/config.json` had expired, not a network problem.
- Re-running the failed `deploy` job (`gh run rerun 32603236919 --failed`) fixed
  it: that job's own `docker login` refreshes the host credential, and the pull
  then succeeded. **Retrying the local pull would never have worked** — the two
  failure modes wear similar clothes.

### Live verification

```
docker inspect ahantime-web-1 --format '{{.Config.Image}}'
  → ghcr.io/am1eza/iron-web:4f8b60e93f88ece860514bf563db6590b7cf7f4c   ✅

curl -sk --resolve ahantime.com:443:127.0.0.1       https://ahantime.com/        → 200 ✅
curl -sk --resolve panel.ahantime.com:443:127.0.0.1 https://panel.ahantime.com/  → 307 ✅
curl -sk --resolve ahantime.com:443:127.0.0.1       https://ahantime.com/admin   → 404 ✅
docker exec ahantime-web-1 grep -rl 'محل تولید' .next/
  → .next/server/chunks/1520.js, .next/static/chunks/450-….js                    ✅
```

Live HTML through Caddy, per sub-category:

| Page | Headings / columns served in production |
|---|---|
| `/prices/profile/profil-sotuni` | «قیمت پروفیل تهران» · «قیمت پروفیل مشهد» · «قیمت پروفیل نامشخص» · «گرید» kept |
| `/prices/profile/profil-z` | «قیمت پروفیل تهران» · «قیمت پروفیل مشهد» · «قیمت پروفیل نامشخص» · «طول سفارشی» |
| `/prices/profile/profil-galvanizeh` | flat, «محل تولید» column, «گرید» kept |
| `/prices/profile/profil-mobli` | flat, «گرید» only, no «محل تولید» |

No «کارخانه» column or section on any of them. Matches the after-screenshots
exactly.

---

<a id="agent-report-profile-slug-cleanup"></a>

## Source: `AGENT_REPORT_profile_slug_cleanup.md`

# AGENT_REPORT — the پروفیل duplicate-slug situation, investigated and closed

**Date:** 1405/06/01 (2026-08-23) · **Branch:** `profile-slug-cleanup-1787441979` · **Base:** `ec45fc3` (post-#226)

## The headline

**The brief's diagnosis was backwards, and following it would have hidden a priced product.**

The three `prvfyl-*` پروفیل sub-categories are not leftovers from the PR #224 re-slug awaiting
retirement. They are the **current** sub-categories, created by the owner on **2026-08-21** —
*ten days after* the `profil-*` rows they appear to duplicate were retired. The `profil-*` rows are
the retired half. Row age, not slug spelling, decides which is canonical here.

So there was **no orphaned inventory to migrate** (brief step 2) and **nothing redundant to
deactivate** (step 3). What existed was exactly what step 4 described: three stale `redirects` rows
shadowing live routes. Those are gone, and every affected URL now serves 200.

| Brief step | Verdict |
|---|---|
| 1 · Investigate every old/new pair | Done. **3 pairs, not 21** — the "21" was the sub-category *count* under پروفیل |
| 2 · Migrate orphaned SKUs | **Not performed — no orphan exists.** The 1 SKU is already on the correct, live row |
| 3 · Deactivate redundant old slugs | **Not performed — they are not redundant.** Deactivating them would hide a priced SKU and strand shipped code |
| 4 · Remove orphaned redirect rows | **Done** — 3 deleted, 1 repointed, 1 chain collapsed |
| 5 · Sitemap verification | Done — full production crawl, 1,226/1,226 × 200 |
| 6 · Full verification | Done — tsc, lint, 650 tests, `next build`, live crawl |
| 7 · PR | Opened. **Not merged** — see *Merge decision* |

---

## 1. The definitive pair table

Every sub-category under `profile` (`c3`), grouped by Persian display name. Only three names
appear twice; the rest are unique.

| Persian name | Old-style slug | active? | active SKUs | New-style slug | active? | active SKUs | Same products? |
|---|---|---|---|---|---|---|---|
| پروفیل صنعتی | `prvfyl-snaty` | **✔** | **1** | `profil-sanati` | ✘ | 0 | n/a — the new-style row was **always empty** |
| پروفیل ساختمانی | `prvfyl-sakhtmany` | **✔** | 0 | `profil-sakhtemani` | ✘ | 0 | n/a — both empty |
| پروفیل استیل | `prvfyl-astyl` | **✔** | 0 | `profil-steel` | ✘ | 0 | n/a — both empty |

No SKU has ever existed under any of the three `profil-*` rows. There is no pair anywhere in
پروفیل where the same product sits under two slugs, and no pair where the old slug holds stock the
new slug lacks. The premise of steps 2 and 3 does not occur in the data.

The other 15 پروفیل sub-categories are single-slug: four live under `profil-*` names
(`profil-mobli`, `profil-sotuni`, `profil-galvanizeh`, `profil-z`) and eleven retired.

### Why the earlier report said "21"

There are exactly **21 sub-category rows** under پروفیل. That count — not a count of pairs — is
what got carried into the brief as "roughly 21 پروفیل sub-categories may exist as pairwise
duplicates." The three example pairs it named are the three real ones.

## 2. What actually happened, from `audit_entries`

| When | What |
|---|---|
| 2026-08-01 11:06–11:11 | Owner creates «پروفیل ساختمانی / صنعتی / استیل» in the panel. `slugify()` derives `prvfyl-sakhtmany`, `prvfyl-snaty`, `prvfyl-astyl`. |
| 2026-08-04 04:33 | `renameCatalogSlugs.ts` (PR #224) renames **those same rows** to `profil-sakhtemani` / `profil-sanati` / `profil-steel` and writes old→new redirects. |
| 2026-08-14 01:42 | All three are still empty, so they are retired: `is_active = false`, and **both** the old and the new URL are repointed to `/prices/profile`. This is when the three rows stopped being slug→slug maps and became retire-to-parent rows. |
| **2026-08-21 21:40** | Owner creates the three sub-categories **again** — new ULIDs, `is_active = true`, ordered into place beside the live ones. `slugify()` derives `prvfyl-*` a second time, straight into the retired URLs. |
| 2026-08-21 21:46 | Owner adds «پروفیل صنعتی ۸۰×۸۰» (`profile-80x80`, `branch_length_m = 6`, `unit = meter`) under پروفیل صنعتی. |
| 2026-08-22 19:04 | The SKU is priced: **۱۰۸٬۱۸۲ تومان/kg**. |

The `prvfyl-*` rows are twelve hours *newer* than the retirement that buried their URLs.

### The shipped code agrees with that reading

PR #224's own application code is keyed on the `prvfyl-*` slugs, not the `profil-*` ones:

- `src/lib/utils/catalogLabels.ts` — `PROFILE_NO_FACTORY_SUBS` contains `prvfyl-snaty` and
  `prvfyl-astyl`; `PROFILE_ATTRS` gives `prvfyl-snaty` its «طول شاخه» column and `prvfyl-astyl`
  its «آلیاژ» + «طول شاخه» columns.
- `src/lib/server/services/priceSync.match.ts` — maps `profile/prvfyl-snaty` to its
  ahanonline source table.
- `src/lib/server/repos/profileFactory.pg.test.ts`, `catalogLabels.test.ts` — same slugs.

Deactivating `prvfyl-snaty`/`prvfyl-astyl` would have left all of that pointing at nothing, and
hidden the ۱۰۸٬۱۸۲ ت/kg SKU site-wide (every public read filters `sub_categories.is_active`).

## 3. Root cause — still open, deliberately not fixed here

`slugify()` (`src/lib/utils/slugify.ts`) drops Persian short vowels: «پروفیل» → `prvfyl`,
«صنعتی» → `snaty`. The admin panel auto-derives the slug from the Persian name, so **any row an
admin recreates gets the pre-#224 spelling back**. `renameCatalogSlugs.ts` corrected the *data*
with a hand-written map and left the slugifier alone.

Compounding it, `POST /api/admin/catalog/subcategories` never checks whether a `redirects` row
already claims the URL it is about to publish. Nothing warns the admin; the page simply 308s away.

This is not پروفیل-specific — any category can hit it. **Recommended follow-up (own PR):** on
sub-category create/update, reject (or at minimum warn) when `redirects.from_path` already claims
the resulting public path, pointing the admin at the redirects panel. Not done here because it
touches an admin write path and this PR is meant to stay a verifiable data fix.

---

## 4. Every row changed — the full audit

Applied by `web/scripts/unshadowProfileSubCategories.ts --apply`, in **one transaction**, against
the production database on 2026-08-23 ~00:35 UTC.

### Sub-category rows changed: **none**

Not one `sub_categories` row was touched — no `is_active` flip in either direction.

### SKU rows changed: **none**

No SKU was re-parented, deactivated, or edited. `profile-80x80` sits where the owner put it.

### `redirects` rows DELETED — 3

| id | from_path | to_path |
|---|---|---|
| `01KZ5GSC66J1265SA5Y1VTYZTG` | `/prices/profile/prvfyl-snaty` | `/prices/profile` |
| `01KZ5GSC5VA6ZTC38HKRTZ376B` | `/prices/profile/prvfyl-sakhtmany` | `/prices/profile` |
| `01KZ5GSC6EJ4FXS71VX3D90THG` | `/prices/profile/prvfyl-astyl` | `/prices/profile` |

Each `from_path` is now a live route in its own right, so there is no "old URL" semantics left to
preserve — the row was pure shadow. `redirects` has no `is_active` column
(`id, from_path, to_path, permanent, created_at, updated_at`), so removal is necessarily a
`DELETE`; there is no soft form. This is why the script's guard is strict: a row is removed **only**
when its `from_path` is an *active* sub-category **and** its `to_path` is that sub-category's own
parent category page. A genuine slug→slug map can never match that shape, and the script aborts
rather than guess.

### `redirects` rows UPDATED — 2

| id | from_path | to_path before | to_path after | why |
|---|---|---|---|---|
| `01KZYYZ74F8V5B5PWGCGH7PGWX` | `/prices/profile/profil-sanati` | `/prices/profile` | `/prices/profile/prvfyl-snaty` | The retired slug's live same-named twin exists again and carries stock, so the old URL should land on the product page, not one level up |
| `01KZ5GSC8C4J1HT6PF0FRYQKS0` | `/prices/astyl/prvfyl-astyl` | `/prices/steel/profil-steel` | `/prices/profile` | Collapses a two-hop 308→308 chain. Same final destination, one fewer hop — asserted, not assumed |

### Deliberately left alone

| Row | Why |
|---|---|
| `/prices/profile/profil-steel` → `/prices/profile` | Correct retire-redirect. Repointing it at the live `prvfyl-astyl` would send crawlers to an **empty** page; the category is the better landing |
| `/prices/profile/profil-sakhtemani` → `/prices/profile` | Same |
| `/prices/steel/profil-steel` → `/prices/profile` | A `steel`-category taxonomy question (`steel` has its own live `profile` = پروفیل استیل sub). Out of scope; flagged, not guessed at |
| `sub_categories.prvfyl-sakhtmany`, `prvfyl-astyl` (active, empty) | Owner-created active-and-empty on 2026-08-21. That matches this catalog's established, owner-directed pattern for empty-but-live sub-categories; they now render as real pages like the rest |

**Rollback**: the pre-change state of all five rows is preserved as INSERT statements in the report
appendix below.

---

## 5. Verification

### Live production, before → after

| URL | before | after |
|---|---|---|
| `/prices/profile/prvfyl-snaty` | **308** → `/prices/profile` | **200** |
| `/prices/profile/prvfyl-snaty/profile-80x80` | 200 (unreachable in practice) | **200** (reachable) |
| `/prices/profile/prvfyl-astyl` | **308** → `/prices/profile` | **200** |
| `/prices/profile/prvfyl-sakhtmany` | **308** → `/prices/profile` | **200** |
| `/prices/profile/profil-sanati` | 308 → `/prices/profile` | 308 → `/prices/profile/prvfyl-snaty` |
| `/prices/astyl/prvfyl-astyl` | 308 → `/prices/steel/profil-steel` (→ 308) | 308 → `/prices/profile` |

`/prices/profile/prvfyl-snaty` renders «پروفیل صنعتی 80×80» with its price. The two empty
sub-categories serve their (empty) pages, as intended.

### Sitemap — step 5

- **1,226 `<loc>` entries**. The three unshadowed sub-category pages are advertised again — the
  sitemap's redirect gate (PR #226) had been suppressing exactly those three, and now suppresses
  nothing. `/prices/profile/prvfyl-snaty/profile-80x80` was already listed (the gate matches
  `from_path` exactly, and no row ever claimed the SKU URL); it is now reachable from its own
  sub-category page rather than only from the category page's filter chip.
- **No `profil-sanati` / `profil-steel` / `profil-sakhtemani` URL leaks in** — those rows are
  inactive, so the catalog queries never emit them.
- SQL cross-check: **zero** sitemap paths match any `redirects.from_path`.
- **Full HTTP crawl of all 1,226 URLs against production: 1,226 × 200. Zero 404s, zero 308s.**
  (Crawled at ~2.5 req/s — per the earlier report, a faster crawl induces spurious 502s from this
  origin.)

### Code gates — step 6

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next lint` on all 3 touched files | clean |
| `vitest` — `sitemap.test.ts`, `catalogLabels.test.ts`, `redirectsRepo.test.ts` | 59/59 pass |
| `vitest` — full `src/lib/server/**` + `src/lib/utils/**` (55 files) | 591/591 pass |
| `next build` in Docker | green |

Per the repo's OOM note, the *entire* `vitest run` suite was not run on this host — CI runs it.

### Idempotency

Re-running the script with no flags reports "Nothing to do." Every step recomputes from the
database, so a second `--apply` is a no-op.

---

## 6. Changes in this PR

| File | Change |
|---|---|
| `web/scripts/unshadowProfileSubCategories.ts` | **new** — the repair, dry-run by default, one transaction, precondition-guarded, idempotent. Its header is the full investigation record |
| `web/src/app/sitemap.ts` | comment only — the redirect gate's note said the three 308s were "orphaned by the پروفیل re-slug". They were not; corrected, and the gate is kept with the real reason it still matters |
| `web/src/app/sitemap.test.ts` | comment only — same correction to the test's narrative note. **No test behaviour changed**; the fixture is a faithful record of the historical case |

No production code path changed. The DB changes are already live (they are what the verification
above measures); the code diff is documentation plus the script that performed them.

---

## 7. Merge decision

**Opened, not merged.** The data change is done, verified end-to-end against production, and low
risk. But this PR's *value* is the corrected causal record, and the brief's own instruction was to
stop short of merging if there is any doubt. There is one thing worth a human's eye first:

> The brief asked for three `prvfyl-*` sub-categories to be **deactivated**. They were not — doing
> so would have hidden a priced product. If the owner's actual intent on 2026-08-21 was to move
> پروفیل onto the `profil-*` slugs and they simply re-created the rows by hand without realising
> the panel would re-derive the old spelling, then the right end state is different from this one:
> rename the three live rows to `profil-*`, update `catalogLabels.ts` and `priceSync.match.ts` to
> match, and re-point the redirects. That is a product decision about URLs, not a data-hygiene fix,
> and it is not one to make unprompted.

Either way the change here is correct and strictly better than the previous state — three URLs that
308'd away now serve, and one of them sells something. Nothing in it blocks the larger rename if
the owner wants it.

CI status should be checked before merge; per CLAUDE.md, `Deploy preview to GitHub Pages` and
`Workers Builds: ahantime` are known-red independently of any change.

---

## Appendix — rollback SQL

```sql
-- Restores the exact pre-change state of all five affected rows.
BEGIN;
DELETE FROM redirects WHERE from_path IN (
  '/prices/astyl/prvfyl-astyl', '/prices/profile/prvfyl-sakhtmany',
  '/prices/profile/prvfyl-snaty', '/prices/profile/prvfyl-astyl',
  '/prices/profile/profil-sanati');
INSERT INTO redirects (id,from_path,to_path,permanent,created_at,updated_at) VALUES
 ('01KZ5GSC8C4J1HT6PF0FRYQKS0','/prices/astyl/prvfyl-astyl','/prices/steel/profil-steel',true,'2026-08-04 04:33:54.078523+00','2026-08-04 04:33:54.078523+00'),
 ('01KZ5GSC5VA6ZTC38HKRTZ376B','/prices/profile/prvfyl-sakhtmany','/prices/profile',true,'2026-08-04 04:33:54.078523+00','2026-08-14 01:42:46.676866+00'),
 ('01KZ5GSC66J1265SA5Y1VTYZTG','/prices/profile/prvfyl-snaty','/prices/profile',true,'2026-08-04 04:33:54.078523+00','2026-08-14 01:42:46.67817+00'),
 ('01KZ5GSC6EJ4FXS71VX3D90THG','/prices/profile/prvfyl-astyl','/prices/profile',true,'2026-08-04 04:33:54.078523+00','2026-08-14 01:42:46.679061+00'),
 ('01KZYYZ74F8V5B5PWGCGH7PGWX','/prices/profile/profil-sanati','/prices/profile',true,'2026-08-14 01:42:46.671683+00','2026-08-14 01:42:46.671683+00');
COMMIT;
-- middleware caches redirects for 60s.
```

---

<a id="agent-report-seed-data-prices-fix"></a>

## Source: `AGENT_REPORT_seed_data_prices_fix.md`

# Seed data in production prices — what was there, what was published, what was removed

**Status: fixed in production.** 158 synthetic `current_prices` rows and 21,871
synthetic `price_points` deleted from the live database at **2026-08-23 20:33 UTC**
(1405/06/02). One row that looked like seed data is **not**, and was left alone.
No price was invented to fill a gap; every SKU that could not be priced from a
verified source is now `«بدون قیمت»`, this repo's existing "we do not know this
price" state (PR #230).

The accompanying code change is on branch `worktree-seed-data-prices-fix` and
closes a **second, independent** source of fabricated prices found during the
work — one that is still shipping today and needs the PR merged to stop.

---

## 0. Correction to the brief's premise, stated up front

The brief describes «159 live SKUs serving fake seed-era prices as real prices».
The number and the diagnosis of *what the rows are* were right. Where they were
being **published** was not, and it matters because it changes both the severity
and the fix.

**The seed prices were not reaching any customer as prices.** `getPriceFreshness`
withholds any price older than `PRICE_STALE_HIDE_AFTER_DAYS` (2 business days)
everywhere a `current_prices` row is read — price tables, search, estimates,
leads, the AI advisor tools and the Product JSON-LD. Fetched live from this host
before the fix, the public DTO for one of them was:

```json
"current": { "skuId": "ibeam-castellated-24", "price": 0,
             "updatedAt": "2026-07-07T13:53:41.801Z",
             "isStale": true, "priceHidden": true }
```

The number is zeroed server-side; the row renders «تماس بگیرید». So there was no
mispriced-quote exposure through the price tables, and no risk of honouring a
45,550 T/kg pipe.

**The chart had no such gate, and that is where the fake numbers were published.**
`GET /api/sku/{slug}/history` and the server-rendered `PriceChart` read
`price_points` directly. On the ۳ ماه and سال ranges a live product page served
the full ninety-day generated walk — and stated two of its values in Persian
numerals in the caption. Fetched live, before the fix:

```
https://ahantime.com/prices/ibeam/lane-zanburi/ibeam-castellated-24
  نمودار قیمت در ماه؛ از ۳۸٬۳۹۱ تومان به ۴۰٬۸۰۰ تومان
```

Neither number ever existed. That is the real trust exposure the brief is about,
it was on every one of the **243** fixture SKUs (not 159 — including the 84
whose current price had since been corrected, whose charts spliced a real price
onto a fabricated run-up), and it is fixed.

---

## 1. Root cause

`src/lib/server/db/seed.ts` boots a fresh database from the deterministic fixture
catalog in `src/lib/mock/catalogData.ts`. For each fixture row it writes a
`current_prices` row and `historyDays = 90` daily `price_points` from
`priceSeries()`, a seeded pseudo-random walk. It is guarded —
`if (!skusEmpty && !force)` — so it cannot touch a populated catalog **unless run
with `FORCE_RESEED=true`**.

It was, once, against production, on **2026-07-07 at 13:53 UTC** (1405/04/16,
18:23 Tehran). Five independent signatures agree, and the last two make it a
single script run rather than any pattern of human saves:

| Signature | Value |
|---|---|
| `current_prices.updated_at` spread | all 158 inside **13:53:40 → 13:53:46 UTC**, a 7-second window |
| `updated_by` | `NULL` on all 158 — the seeder's own production branch, which refuses to seed `u-admin` without `DEV_ADMIN_MOBILE` |
| SKU ids | all 243 fixture SKUs have `id = slug`; every SKU created since gets a ULID |
| `price_points` | exactly 90–91 per SKU, one per day 2026-04-09 → 2026-07-07, none after; mean absolute daily move **0.58%** |
| `current_prices.price` | equals the last point of that walk on **159 of 159** rows, which is how the seeder writes it |

Contrast with a genuinely priced SKU: four points total, two of them the same
day, irregular.

The file's own comment already records that "the first prod force-reseed failed"
on the `u-admin` FK — so a production force-reseed is documented in the codebase;
this is the run that succeeded. `scripts/retireImpossibleSkus.ts` independently
described the same fixture catalog reaching production and retired 43 of its
impossible SKUs.

**How to stop it recurring.** `FORCE_RESEED=true` against a production
`DATABASE_URL` is the only path, and nothing in `seedDatabase` refuses it. The
cheap guard — not taken here because it is a behaviour change outside this
brief, and it is the owner's call — is to make `force` a no-op when
`NODE_ENV === 'production'` unless a second, explicit variable is set.

---

## 2. Per-category verdict — is it really seed data?

Checked exactly as the pipe job did: `price_points` shape per SKU, sampled in
every one of the seven categories. Every sample is the same smooth daily walk
starting 2026-04-09 and stopping dead on 2026-07-07.

| Category | Rows | Active SKUs | Price range (T/kg) | Sample checked | Verdict |
|---|---:|---:|---|---|---|
| ورق | 33 | 11 | 40,950–46,700 | ورق سیاه ۱۰ · 38,282 → 43,400, 91 daily points | **seed** |
| لوله | 33 | 21 | 45,550–51,800 | لوله مبلی ۲½ اینچ · 43,530 → 49,150 | **seed** |
| میلگرد | **32** | 0 | 33,250–38,000 | میلگرد آلیاژی ۱۲ · 32,400 → 37,350 | **seed** |
| نبشی و ناودانی | 18 | 15 | 34,400–38,250 | نبشی بال مساوی ۱۴ · 33,399 → 35,800 | **seed** |
| کلاف و مفتول | 16 | 14 | 37,300–41,400 | کلاف ساده ۳ · 36,201 → 40,500 | **seed** |
| تیرآهن | 14 | 9 | 37,650–41,000 | تیرآهن لانه‌زنبوری ۲۰ · 39,390 → 41,000 | **seed** |
| پروفیل | 12 | 8 | 43,400–46,800 | پروفیل و قوطی گالوانیزه ۲۰×۲۰ · 41,774 → 44,550 | **seed** |
| **total** | **158** | **78** | | | |

Two corrections to the brief's table:

- **میلگرد is 32, not 33.** The 33rd row in that date window,
  `rebar-deformed-1` («میلگرد آجدار ۱۰», 36,200 T/kg), was saved by the admin
  **امیر at 17:11:11 UTC**, three hours and eighteen minutes after the seed run,
  at a price the fixture does not contain (the fixture says 35,200). It is a
  real admin-entered price that went stale, exactly the case the brief asked to
  separate out. **Left untouched.** Its SKU is inactive, so it is not
  customer-facing either way.
- **Only 78 of the 158 are on active SKUs.** The other 80 sit on SKUs already
  deactivated — 32 of 32 میلگرد rows among them, so rebar had **zero**
  customer-facing exposure. They were still deleted: an `is_active` flip is one
  UPDATE, and a reactivated SKU carrying a fake price is precisely the trap
  recorded in the stranded-sub-categories work.

---

## 3. Getting a real price: what was tried, and why 0 of 78 could be priced

### 3.1 The matcher, re-run today

`scripts/repairSeedPrices.ts` runs the production matcher (`matchSku`, same
gates, same live fetch) scoped to the 78 active seed SKUs, against ahanonline's
page set as expanded by PR #236. **21 pages, 1,169 source rows, 0 fetch
failures. Zero confident matches:**

```
skip:no-size-match          38
skip:low-confidence-match   24
skip:no-source-mapping      14
skip:source-not-per-kg       2
```

That agrees with `price_sync_entries` from the twice-daily cron: across six runs
the mirror has never written any of these SKUs. The one apparent exception in
the log is instructive — `angle-channel-spot-14` («نبشی لقمه ۱۰») was written at
78,281 on 2026-08-22 and **deliberately rolled back the same evening** by the
price-sync job, because ahanonline's «نبشی 10\*100\*100 آریان فولاد» is a length
of angle and نبشی لقمه is a cut spacer. Every confidence gate had passed; the
taxonomy map was wrong. That rollback is why the row was back at its seed value
and in scope for this pass.

### 3.2 Why per-SKU market research cannot rescue these either

The brief asks, where no automated match exists, to research the real market
price the way the pipe/billet verifications did. **For these rows there is no
product to research.** `catalogData.ts:106`:

```ts
const factory = factories[Math.floor(rnd() * factories.length)]!;
```

The mill on every one of these SKUs was **drawn at random from a category-wide
list by an LCG**, and the size range is a random slice
(`allSizes.slice(start, start + count)`). The mill × sub-type × size identity is
itself generated. `retireImpossibleSkus.ts` reached the same conclusion from the
size side and retired 43 SKUs on it.

Measured against the live source pages fetched today, per active seed SKU:

| What the source says about this SKU's identity | SKUs |
|---|---:|
| **the mill is not sold in this product line at all** by the source | **55** |
| no source page maps to this sub-category | 14 |
| mill present in the line, but no row of this size | 4 |
| mill and size both present, never on the same row | 3 |
| a same-mill same-size row does exist | 2 |

The two survivors are `ibeam-light-5` («تیرآهن سبک ۱۸ فایکو») and `ibeam-light-8`
(«تیرآهن سبک ۲۴ یزد احرامیان»), and both are correctly declined:
`skip:source-not-per-kg`. The matched rows («تیرآهن 18 فایکو 12 متری بنگاه
تهران») are priced **per شاخه** while our SKUs are `price_basis = 'kg'`, and
converting needs a branch weight these SKUs do not credibly have — their
`theoretical_weight_kg` came from the round-bar formula bug fixed in #199. They
are also plain تیرآهن rows, not **سبک**, which is a different product; taking
them would repeat the نبشی-لقمه error exactly. Their sub-category is inactive
in any case.

So: quoting any of these 78 from a competitor page would mean asserting a price
for a mill that does not make that product. Nothing was estimated. **All 78 are
now «بدون قیمت».**

### 3.3 Why deletion, and why that is not a cop-out

PR #230 established the convention: an active SKU with **no `current_prices` row**
is the visible "we do not know this price" state. It renders «تماس بگیرید»
(a defensible lead-gen state — «اول مشورت، بعد خرید»), it is counted by
`listActiveSkuIdsWithoutPrice()`, it lights the **urgent «کالای بدون قیمت»
dashboard tile**, it filters into the pricing grid via `?unpriced=1`, and
`CatalogManager` badges it «بدون قیمت».

Zeroing the price instead would have been invisible to all five of those: the
tile counts rows in `current_prices`, the table a zeroed row is still in.

**The visible change on the price tables is nil.** These prices were already
past the 2-day hide threshold, so those rows already read «تماس بگیرید» before
the fix and read «تماس بگیرید» after it. Verified live on
`/prices/ibeam/lane-zanburi/ibeam-castellated-24`: 14 occurrences before, 14
after. Only the chart changed.

---

## 4. The second fabrication source — still live, needs the PR merged

Found while verifying the fix. `src/lib/server/catalog.ts`, in the **live**
branch:

```ts
const points = await repo.skuHistory(skuSlug, range);
if (points.length === 0) return mock.priceSeries(skuSlug, currentPrice, days);  // ← removed
```

`mock.priceSeries` is a seeded random walk around the current price. So **any**
product with no stored history published a full invented series on its public
page, generated per request, captioned with two of its own invented numbers, and
nothing marked it synthetic. It has been firing on the 7 never-priced SKUs from
PR #230 all along, and it is the only remaining `mock.*` call reachable in live
mode — every other one in that file is behind `if (!live())`.

Deleting the fabricated `price_points` **routes more SKUs into it**, not fewer:
85 unpriced active SKUs now instead of 7. The DB fix alone would have swapped
stored fake history for generated fake history.

The branch removes the fallback, so live mode returns exactly what the database
holds — empty included — and `PriceChart` renders an honest empty state
(«هنوز سابقهٔ قیمتی برای این کالا ثبت نشده است.») instead of dividing by an
absent first point.

> **Interim state on production, until the PR is merged and deployed.** The
> deployed image still has the fallback, so an unpriced SKU's chart currently
> reads «نمودار قیمت در ماه؛ از ۰ تومان به ۰ تومان» — a zero, not an invented
> market price, on a row already marked «تماس بگیرید», so it misleads no one.
> It is cosmetic and it is what the PR fixes. Merging promptly is worth it.

---

## 5. What was changed, exactly

### Production database, applied 2026-08-23 20:33 UTC

| Change | Count |
|---|---:|
| `price_points` deleted (2026-04-09 → 2026-07-07, fixture-id SKUs only) | **21,871** across 243 SKUs |
| `current_prices` deleted (seed run window, `updated_by IS NULL`, fixture id) | **158** |
| real prices written by the matcher | **0** (none qualified) |
| active SKUs now «بدون قیمت» | 7 → **85** |
| rows in the same date window deliberately kept | **1** (`rebar-deformed-1`) |

Post-conditions verified by direct SQL: 0 fabricated points remain; 1
`current_prices` row older than 2026-07-09 remains (the admin one); `price_points`
went 23,616 → 1,745; no long-running transaction left behind in
`pg_stat_activity`.

Nothing else in the seed window belonged to a non-fixture SKU — 21,871 of 21,871
points in that window were on fixture ids — so the delete could not have caught a
real price.

**Reversible.** Full CSV dumps of both deleted sets are at
`/opt/ahantime/.claude/backups/backup_current_prices.csv` and
`backup_price_points.csv`.

### Code, on `worktree-seed-data-prices-fix`

| File | Change |
|---|---|
| `web/scripts/repairSeedPrices.ts` | new — the one-off repair, dry-run by default, re-runnable, `--apply` / `--no-fetch`; the full root-cause evidence is in its header |
| `web/src/lib/server/catalog.ts` | drop the live-mode mock-history fallback |
| `web/src/components/catalog/PriceChart.tsx` (+ `.module.css`) | honest empty state for a SKU with no history |
| `web/src/lib/server/catalogPriceSeries.test.ts` | new — live mode never invents a series |
| `web/src/components/catalog/PriceChart.test.tsx` | empty series renders the message, no SVG, no `NaN` |

`tsc --noEmit` clean, `next lint` clean on the touched files, `stylelint` clean,
246 targeted tests green (`src/components/catalog`, `src/lib/seo`, the new file).
The full suite is left to CI — it OOMs this box.

---

## 6. The 158 rows, in full

Generated from the deleted rows themselves plus a live matcher pass. `mill on source page` answers «does the source sell this mill in this product line at all» — the direct test of whether the SKU's randomly assigned mill names a real product. Every active row is now «بدون قیمت»; inactive rows were deleted and were not customer-facing.

### لوله — 33 rows, 21 active

| SKU id | name | mill | seed price | mill on source page | matcher verdict |
|---|---|---|---:|---|---|
| `pipe-industrial-12` | لوله صنعتی درزدار ۱¼ اینچ | لوله سمنان | 49,800 | **no** | no size match on the source page |
| `pipe-industrial-13` | لوله صنعتی درزدار ۱½ اینچ | سپنتا | 50,800 | **no** | no size match on the source page |
| `pipe-industrial-15` | لوله صنعتی درزدار ۲½ اینچ | درپاد تهران | 51,650 | **no** | no size match on the source page |
| `pipe-seamless-1` | لوله مانیسمان ۳ اینچ | تهران شرق | 49,050 | **no** | low confidence — different mill |
| `pipe-seamless-2` | لوله مانیسمان ۴ اینچ | لوله سپاهان | 48,200 | **no** | low confidence — different mill |
| `pipe-seamless-3` | لوله مانیسمان ۵ اینچ | سپنتا | 50,500 | **no** | low confidence — different mill |
| `pipe-seamless-4` | لوله مانیسمان ۶ اینچ | لوله سپاهان | 51,800 | **no** | low confidence — different mill |
| `pipe-seamless-5` | لوله مانیسمان ۸ اینچ | لوله سپاهان | 51,500 | **no** | low confidence — different mill |
| `pipe-furniture-35` | لوله مبلی ۲½ اینچ | لوله سمنان | 49,150 | **no** | no size match on the source page |
| `pipe-furniture-36` | لوله مبلی ۳ اینچ | سپنتا | 49,450 | **no** | no size match on the source page |
| `pipe-furniture-37` | لوله مبلی ۴ اینچ | لوله سپاهان | 50,750 | **no** | no size match on the source page |
| `pipe-furniture-38` | لوله مبلی ۵ اینچ | لوله سپاهان | 48,100 | **no** | no size match on the source page |
| `pipe-gas-10` | لوله گازی ۸ اینچ | لوله سمنان | 49,300 | **no** | no size match on the source page |
| `pipe-gas-6` | لوله گازی ۳ اینچ | درپاد تهران | 50,000 | **no** | low confidence — different mill |
| `pipe-gas-7` | لوله گازی ۴ اینچ | لوله‌سازی اهواز | 48,750 | **no** | low confidence — different mill |
| `pipe-gas-8` | لوله گازی ۵ اینچ | سپنتا | 50,500 | **no** | low confidence — different mill |
| `pipe-gas-9` | لوله گازی ۶ اینچ | نورد لوله ساوه | 49,350 | **no** | low confidence — different mill |
| `pipe-galvanized-23` | لوله گالوانیزه ۳ اینچ | تهران شرق | 47,700 | **no** | low confidence — different mill |
| `pipe-galvanized-24` | لوله گالوانیزه ۴ اینچ | لوله سمنان | 45,550 | **no** | low confidence — different mill |
| `pipe-galvanized-25` | لوله گالوانیزه ۵ اینچ | لوله‌سازی اهواز | 45,750 | **no** | low confidence — different mill |
| `pipe-galvanized-27` | لوله گالوانیزه ۸ اینچ | لوله‌سازی اهواز | 48,750 | **no** | low confidence — different mill |

Plus **12** rows on already-deactivated SKUs (46,250–51,600 T/kg; اسپیرال, داربستی) — deleted, never customer-facing.

### ورق — 33 rows, 11 active

| SKU id | name | mill | seed price | mill on source page | matcher verdict |
|---|---|---|---:|---|---|
| `sheet-checkered-26` | ورق آجدار ۲ | ورق شهرکرد | 45,650 | **no** | no size match on the source page |
| `sheet-checkered-27` | ورق آجدار ۲.۵ | تاراز | 42,600 | **no** | no size match on the source page |
| `sheet-oiled-8` | ورق روغنی ۲.۵ | امیرکبیر کاشان | 43,800 | **no** | no size match on the source page |
| `sheet-oiled-9` | ورق روغنی ۳ | امیرکبیر کاشان | 43,750 | **no** | no size match on the source page |
| `sheet-black-1` | ورق سیاه ۱۰ | تاراز | 43,400 | **no** | low confidence — different mill |
| `sheet-black-2` | ورق سیاه ۱۲ | هفت‌الماس | 45,800 | **no** | low confidence — different mill |
| `sheet-deck-42` | ورق عرشه فولادی ۰.۷ | فولاد سبا | 45,750 | **no** | no size match on the source page |
| `sheet-deck-44` | ورق عرشه فولادی ۱.۵ | اکسین اهواز | 43,350 | **no** | no size match on the source page |
| `sheet-galvanized-13` | ورق گالوانیزه ۴ | فولاد سبا | 43,850 | **no** | no size match on the source page |
| `sheet-galvanized-14` | ورق گالوانیزه ۵ | فولاد گیلان | 44,350 | **no** | no size match on the source page |
| `sheet-galvanized-15` | ورق گالوانیزه ۶ | قطعات اصفهان | 43,250 | **no** | no size match on the source page |

Plus **22** rows on already-deactivated SKUs (40,950–46,700 T/kg; آجدار, اسیدشویی, رنگی, روغنی, عرشه فولادی, ورق گالوانیزه) — deleted, never customer-facing.

### میلگرد — 32 rows, 0 active

Plus **32** rows on already-deactivated SKUs (33,250–38,000 T/kg; آلیاژی, خاموت, ساده, میلگرد آجدار, کلاف) — deleted, never customer-facing.

### نبشی و ناودانی — 18 rows, 15 active

| SKU id | name | mill | seed price | mill on source page | matcher verdict |
|---|---|---|---:|---|---|
| `angle-channel-tbar-28` | سپری ۵ | جاوید بناب | 35,950 | **no** | low confidence — different mill |
| `angle-channel-tbar-29` | سپری ۶ | سپهر ایرانیان | 35,450 | **no** | low confidence — different mill |
| `angle-channel-angle-5` | نبشی بال مساوی ۱۴ | ناب تبریز | 35,800 | ناب تبریز | no size match on the source page |
| `angle-channel-angle-6` | نبشی بال مساوی ۱۶ | آریان فولاد | 38,250 | آریان فولاد | no size match on the source page |
| `angle-channel-angle-7` | نبشی بال مساوی ۱۸ | جاوید بناب | 36,600 | فولاد جاوید بناب | no size match on the source page |
| `angle-channel-angle-unequal-10` | نبشی بال نامساوی ۱۸ | ناب تبریز | 35,150 | — | no source page maps to this sub-category |
| `angle-channel-angle-unequal-11` | نبشی بال نامساوی ۲۰ | جاوید بناب | 35,350 | — | no source page maps to this sub-category |
| `angle-channel-angle-unequal-12` | نبشی بال نامساوی ۲۲ | فایکو | 35,000 | — | no source page maps to this sub-category |
| `angle-channel-angle-unequal-8` | نبشی بال نامساوی ۱۴ | ناب تبریز | 35,350 | — | no source page maps to this sub-category |
| `angle-channel-angle-unequal-9` | نبشی بال نامساوی ۱۶ | ظهوریان مشهد | 36,700 | — | no source page maps to this sub-category |
| `angle-channel-spot-13` | نبشی لقمه ۸ | سپهر ایرانیان | 38,000 | — | no source page maps to this sub-category |
| `angle-channel-spot-14` | نبشی لقمه ۱۰ | آریان فولاد | 35,450 | — | no source page maps to this sub-category |
| `angle-channel-spot-15` | نبشی لقمه ۱۲ | شکفته مشهد | 38,150 | — | no source page maps to this sub-category |
| `angle-channel-spot-16` | نبشی لقمه ۱۴ | آریان فولاد | 35,700 | — | no source page maps to this sub-category |
| `angle-channel-spot-17` | نبشی لقمه ۱۶ | دهشیر یزد | 35,500 | — | no source page maps to this sub-category |

Plus **3** rows on already-deactivated SKUs (34,400–37,250 T/kg; سپری) — deleted, never customer-facing.

### کلاف و مفتول — 16 rows, 14 active

| SKU id | name | mill | seed price | mill on source page | matcher verdict |
|---|---|---|---:|---|---|
| `wire-mesh-23` | توری ۴ | جهان فولاد سیرجان | 38,000 | **no** | no size match on the source page |
| `wire-mesh-24` | توری ۵.۵ | جهان فولاد سیرجان | 37,300 | **no** | no size match on the source page |
| `wire-mesh-25` | توری ۶.۵ | جهان فولاد سیرجان | 40,450 | **no** | no size match on the source page |
| `wire-tie-21` | سیم آرماتوربندی ۳ | امیرکبیر خزر | 38,900 | **no** | no size match on the source page |
| `wire-tie-22` | سیم آرماتوربندی ۴ | امیرکبیر خزر | 41,400 | **no** | no size match on the source page |
| `wire-wire-10` | مفتول سیاه ۵.۵ | یزد احرامیان | 40,300 | **no** | no size match on the source page |
| `wire-wire-11` | مفتول سیاه ۶.۵ | آناهیتا گیلان | 40,250 | **no** | no size match on the source page |
| `wire-wire-12` | مفتول سیاه ۸ | فولاد کویر کاشان | 40,800 | **no** | no size match on the source page |
| `wire-wire-9` | مفتول سیاه ۴ | جهان فولاد سیرجان | 40,600 | **no** | low confidence — different mill |
| `wire-wire-galvanized-15` | مفتول گالوانیزه ۵.۵ | فولاد کویر کاشان | 40,250 | **no** | no size match on the source page |
| `wire-wire-galvanized-16` | مفتول گالوانیزه ۶.۵ | سیادن ابهر | 38,150 | **no** | no size match on the source page |
| `wire-coil-ribbed-8` | کلاف آجدار ۱۰ | جهان فولاد سیرجان | 39,400 | جهان فولاد سیرجان | low confidence — different mill |
| `wire-coil-1` | کلاف ساده ۳ | سیادن ابهر | 40,500 | ابهر | no size match on the source page |
| `wire-coil-2` | کلاف ساده ۴ | امیرکبیر خزر | 40,500 | **no** | no size match on the source page |

Plus **2** rows on already-deactivated SKUs (37,700–40,100 T/kg; مفتول گالوانیزه) — deleted, never customer-facing.

### تیرآهن — 14 rows, 9 active

| SKU id | name | mill | seed price | mill on source page | matcher verdict |
|---|---|---|---:|---|---|
| `ibeam-light-5` | تیرآهن سبک ۱۸ | فایکو | 39,000 | فایکو | source prices this per شاخه, our SKU is per kg |
| `ibeam-light-6` | تیرآهن سبک ۲۰ | جهان فولاد غرب | 37,850 | **no** | low confidence — different mill |
| `ibeam-light-7` | تیرآهن سبک ۲۲ | فولاد اهواز | 41,000 | اهواز | low confidence — different mill |
| `ibeam-light-8` | تیرآهن سبک ۲۴ | یزد احرامیان | 38,400 | یزد | source prices this per شاخه, our SKU is per kg |
| `ibeam-light-9` | تیرآهن سبک ۲۷ | یزد احرامیان | 40,600 | یزد | low confidence — different mill |
| `ibeam-castellated-22` | تیرآهن لانه‌زنبوری ۲۰ | جهان فولاد غرب | 41,000 | — | no source page maps to this sub-category |
| `ibeam-castellated-23` | تیرآهن لانه‌زنبوری ۲۲ | فایکو | 38,700 | — | no source page maps to this sub-category |
| `ibeam-castellated-24` | تیرآهن لانه‌زنبوری ۲۴ | ظفر بناب | 40,800 | — | no source page maps to this sub-category |
| `ibeam-castellated-25` | تیرآهن لانه‌زنبوری ۲۷ | فایکو | 39,050 | — | no source page maps to this sub-category |

Plus **5** rows on already-deactivated SKUs (37,650–40,750 T/kg; تیرآهن, هاش سنگین) — deleted, never customer-facing.

### پروفیل — 12 rows, 8 active

| SKU id | name | mill | seed price | mill on source page | matcher verdict |
|---|---|---|---:|---|---|
| `profile-z-18` | پروفیل و قوطی پروفیل Z ۲۰×۲۰ | تهران شرق | 46,300 | **no** | low confidence — different mill |
| `profile-z-19` | پروفیل و قوطی پروفیل Z ۳۰×۳۰ | فولاد مشهد | 44,300 | **no** | no size match on the source page |
| `profile-z-20` | پروفیل و قوطی پروفیل Z ۴۰×۴۰ | جهان پروفیل پارس | 45,950 | **no** | no size match on the source page |
| `profile-z-21` | پروفیل و قوطی پروفیل Z ۴۰×۸۰ | پروفیل یاران | 45,750 | **no** | no size match on the source page |
| `profile-z-22` | پروفیل و قوطی پروفیل Z ۵۰×۵۰ | پروفیل صابری | 46,800 | **no** | no size match on the source page |
| `profile-z-23` | پروفیل و قوطی پروفیل Z ۶۰×۶۰ | فولاد مشهد | 46,150 | **no** | no size match on the source page |
| `profile-z-24` | پروفیل و قوطی پروفیل Z ۷۰×۷۰ | تهران شرق | 43,400 | **no** | no size match on the source page |
| `profile-galvanized-36` | پروفیل و قوطی گالوانیزه ۲۰×۲۰ | نیکان پروفیل | 44,550 | **no** | low confidence — different mill |

Plus **4** rows on already-deactivated SKUs (43,550–46,350 T/kg; پروفیل مبلی) — deleted, never customer-facing.

---

## 7. What the owner should decide next

1. **Merge the PR.** It is what replaces «۰ تومان» on 85 chart panels with an
   honest sentence, and it is what stops `mock.priceSeries` reaching a visitor.
2. **85 products now need a price** — the «کالای بدون قیمت» tile is the queue.
   They are not equally worth pricing: for many, the *mill on the SKU is
   fictional*, so the honest fix is to correct or retire the SKU rather than
   type a number against a mill we do not stock. Seven sub-category pages
   (`profile/profil-z`, `angle-channel/angle-unequal`, `angle-channel/spot`,
   `angle-channel/separi`, `pipe/gas`, `pipe/seamless-internal`,
   `pipe/furniture`, `ibeam/lane-zanburi`) now have **no priced product at all**.
   Their tables did not change — every row already said «تماس بگیرید» — but they
   are worth a decision: stock them, or retire them the way #202 and
   `retireImpossibleSkus.ts` retired their siblings.
3. **Consider refusing `FORCE_RESEED` under `NODE_ENV=production`** (§1). One
   line, and it closes the door this came through.

---

<a id="agent-report-steel-factory-length"></a>

## Source: `AGENT_REPORT_steel_factory_length.md`

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

---

<a id="catalog-gap-fix-report"></a>

## Source: `CATALOG_GAP_FIX_REPORT.md`

# گزارش اصلاح کاتالوگ — وزن، واحد «عدد»، قیمت‌های چندمنبعی، چهارپهلو

**Catalog gap fix — weights, the «عدد» unit, multi-source prices, چهارپهلو, factory links**

- Run: 2026-08-19 23:20 → 2026-08-20, against the live database (`ahantime-db-1`) and `main`.
- 5 PRs; every DB-mutating script dry-ran first, then `--apply`, then a direct re-query of the live DB, then a check of the rendered page through Caddy.
- Live re-verification after the writes: `/prices/ibeam/tirahan` now serves ۸۹٬۱۵۰ and ۷۴٬۰۷۴ (the corrected per-kg figures) with ۱۳٬۸۱۸٬۱۸۱ gone; `/prices/sheet/colored` serves only ۰.۴۸ / ۰.۵ / ۰.۶ mm; `/prices/pipe/scaffold` serves only ۱½ اینچ; and all 8 newly-filled pages return 200 with a real table and no «به‌زودی در این دسته» empty state.
- **Nothing was hard-deleted.** 43 SKUs were soft-deleted (`is_active = false`); every row, its price history and any lead referencing it survive, and one UPDATE reverses each.

| PR | what |
|---|---|
| [#198](https://github.com/Am1eza/Iron/pull/198) | Part 4 — کارخانه cell links to the per-factory page |
| [#199](https://github.com/Am1eza/Iron/pull/199) | The `theoretical_weight_kg` root cause + backfill |
| [#200](https://github.com/Am1eza/Iron/pull/200) | The «عدد» (piece) unit + 65 کوپلر SKUs |
| [#201](https://github.com/Am1eza/Iron/pull/201) | **The 19 تیرآهن rows priced per شاخه in a per-kg column** |
| [#202](https://github.com/Am1eza/Iron/pull/202) | 43 impossible SKUs retired, 10 lines filled, چهارپهلو added |

---

## 0. Headline

| | before | after |
|---|---:|---:|
| Active SKUs | 686 | **937** |
| …publishable price (fresh, not stale) | 543 | **840** |
| Inactive (soft-deleted) SKUs | 44 | 87 |
| Active sub-categories with zero products | 22 | **16** |
| Active SKUs carrying a `theoretical_weight_kg` | 425 | **228** |
| Distinct price units in use | 3 | **4** (`kg` 791 · `branch` 79 · `piece` 65 · `sheet` 2) |

Per category, after:

| دسته | active | قابل انتشار |
|---|---:|---:|
| میلگرد | 326 | 325 |
| ورق | 233 | 222 |
| فلزات رنگی | 72 | 72 |
| لوله | 67 | 46 |
| پروفیل و قوطی | 61 | 53 |
| استیل | 55 | 55 |
| تیرآهن | 46 | 20 |
| کلاف و مفتول | 40 | 25 |
| نبشی و ناودانی | 37 | 22 |

Two notes on reading that table. The drop in "SKUs carrying a weight" from 425 to 228 is the point of §2, not a regression: 197 of those were fabricated and are now honestly null. And the empty-sub-category count moved 22 → 25 → 16 rather than straight down: retiring the fabricated SKUs (§4) *emptied* ورق رنگی, ورق اسیدشویی and لوله اسپیرال, whose only products were the impossible ones, before §5 refilled all three with the real listings.

---

## 1. The most serious thing found — 19 تیرآهن rows, a 155× overcharge

**This was not in the brief. It is the single most important finding of the pass.** ([#201](https://github.com/Am1eza/Iron/pull/201))

`current_prices.price` is per **KILOGRAM** for every member of `PRICE_UNITS`; `unit` says only what `qty` counts in. That is stated verbatim in `leads.service.priceItems` and relied on by `estimate.service`, `tenderEstimate`, `CostCalculator`, `PriceTable` and the search results, all of which compute or display on that basis.

The 2026-08-19 pass wrote its 19 تیرآهن rows from ahanonline's **per-شاخه, 12 m, بنگاه تهران** column — deliberately and transparently (its tier T2, "no conversion, no assumed weight"). But it wrote that per-branch figure into the per-kilogram column, and تیرآهن is the one product family that *also* carries a real `theoretical_weight_kg` (125–510 kg).

Live consequence before the fix:

- «تیرآهن ۱۴ ذوب‌آهن اصفهان» rendered as **۱۳٬۸۱۸٬۱۸۱ تومان / کیلوگرم**.
- One branch on a پیش‌فاکتور priced at `13,818,181 × 155 = 2,141,818,055 تومان` — **155× the real number** — and `allPriced` stayed **true**, so it auto-quoted onto a document that is frozen and SMS'd to the buyer.
- Worst case ۳۰ ذوب‌آهن: a 510 kg branch weight, i.e. a **510×** multiplier.

**Fixed in the data, not the code:** divided by the branch weight so the stored number is per-kilogram. That makes the caption true and makes `unitPrice × weightKg` reproduce the mill's real per-branch price. Changing five call sites instead would have altered the money path everywhere and left the other ~660 genuinely-per-kg SKUs needing a new column to say so.

### Cross-validated before writing — 7 of 7 within 3%

Against مرکزآهن's own published per-kg تیرآهن table (fetched 2026-08-20, dated 1405/5/28):

| SKU | stored ÷ weight | مرکزآهن | Δ |
|---|---:|---:|---:|
| ۱۴ ذوب‌آهن اصفهان | 89,150 | 90,000 | 0.9% |
| ۱۶ ذوب‌آهن اصفهان | 87,081 | 88,181 | 1.2% |
| ۱۸ ذوب‌آهن اصفهان | 87,289 | 89,090 | 2.0% |
| ۱۴ فایکو | 79,461 | 78,181 | 1.6% |
| ۱۴ اهواز | 74,074 | 72,727 | 1.9% |
| ۱۴ ظفر بناب | 74,074 | 76,363 | 3.0% |
| ۱۴ یزد | 79,461 | 79,545 | 0.1% |

That agreement is what makes this a conversion rather than a guess.

**Applied:** 19 rows, band 74,074–106,909 T/kg. Round-trip verified live: `89,150 × 155 = 13,818,250` against the original `13,818,181` — rounding only. Re-running reports 0 to convert (a `PER_BRANCH_FLOOR` guard makes double-division impossible).

**55 more rows share the shape** — see §7 decision #1.

---

## 2. The `theoretical_weight_kg` bug — root cause and fix ([#199](https://github.com/Am1eza/Iron/pull/199))

### Root cause: one line in the mock/seed generator

`web/src/lib/mock/catalogData.ts:114`, read by `scripts/seed.ts`:

```ts
const weight = Math.round((faToInt(size) ** 2 / 162) * 12 * 10) / 10 || 10;
```

`d²/162 × 12 m` — the **round-bar** formula — applied to whatever number a SKU's `size` string happened to start with, **for every category**, with a `|| 10` tail that turned a size parsing to zero into a literal 10 kg.

**`weight.ts` was never wrong.** This is the caller. `catalogCompose.theoreticalWeightFor` was the second half of the problem: it only knew `rebar`/`wire` and returned null for everything else, so the admin form could not prefill a correct نبشی weight even though the repo already held the exact published table.

| SKU | stored | reality |
|---|---:|---|
| نبشی ۱۰ | 7.4 kg | a 6 m L100×100×10 is 94.3 kg |
| ناودانی ۱۰ | 7.4 kg | a 6 m UNP100 is ~64 kg |
| هاش سبک (HEA) ۱۴ | 14.5 kg | a 12 m HEA140 is ~296 kg |
| قوطی ۱۰۰×۱۰۰ | 740.7 kg | — |
| ورق روغنی ۱ | 0.1 kg | — |
| لوله ۱ اینچ | 0.1 kg | — |
| ورق آجدار ۰.۷ | 10 kg | the `\|\| 10` fallback, not a formula |

### The fix

`theoreticalWeightFor` now takes the **sub-category** and resolves it through a documented `CATALOG_WEIGHT_BASIS` table (shape + branch length + how to read `size`), deferring all arithmetic to the one canonical `unitWeightKg`. Sub-category granularity is the point: «نبشی» and «ناودانی» share the `angle-channel` category and are two different published tables; `ibeam` holds تیرآهن, هاش and لانه‌زنبوری, which are three.

Only two lines get a number, because only two have **both** halves published:

- **نبشی** — `ANGLE_KG_PER_M` (مرکزآهن's جدول وزن نبشی, already audited into `weight.ts` on 2026-08-09 and re-confirmed here) over a **6 m** branch, which is the «حالت» ahanonline quotes almost every row of its own نبشی listing in.
- **تیرآهن** — `IBEAM_KG_PER_M` over **12 m**, the length the catalog's own branch-priced rows already encode (ذوب‌آهن ۱۴ = 155 kg = 12.9 × 12).

### The branch-length research, and why 6 m was NOT added to `DEFAULT_LENGTH_M`

The brief asked whether a real standard length should join `DEFAULT_LENGTH_M`. Researched and answered **no**:

- مرکزآهن's نبشی page: "**6-meter and 12-meter branches**" — both standard.
- مرکزآهن's ناودانی page: 6 m and 12 m, plus an 11.75 m Russian standard.
- ahanonline's own نبشی listing: «۶ متری» dominates, «۱۲ متری» exists.

Both lengths are genuinely sold, so 6 m is a **catalog-line convention, not a physical constant** — and silently defaulting it inside the interactive وزن‌سنج is exactly what that table's own comment refuses to do. The 6 m lives in `CATALOG_WEIGHT_BASIS` (catalog composition) instead, where it is documented and cited. `weight.ts` is unchanged.

### Every refusal, with its reason

- **ناودانی سبک / سنگین** — separate weight classes from the استاندارد/اشتال tier `CHANNEL_KG_PER_M` holds, and **the two public tables for them disagree**: مرکزآهن gives ناودانی سنگین ۱۴ = 18 kg/m where فولاد ایرانیان gives 16.25 — an 11% spread on a number that would go on a live commercial page.
- **هاش (HEA/HEB), تیرآهن سبک, لانه‌زنبوری** — each a different section from IPE.
- **نبشی بال نامساوی, سپری, نبشی لقمه** — no published table; an unequal angle needs both legs and a thickness, سپری is a T section, a لقمه has no branch.
- **پروفیل / قوطی** — the box formula needs a wall thickness the catalog does not store.
- **ورق** — needs width × length; `skus.dimensions` is empty on every sheet SKU.
- **لوله** — needs a wall thickness; «۲ اینچ» is the outside diameter only.
- **کلاف / مفتول / توری / سیم** — coils. `weight.ts` deliberately gives `wire` no default length.
- **میلگرد ساده** — found while sourcing its products: ahanonline quotes «شاخه ۶ متری» for the straight-bar mills and «کلاف» for the rest, under one heading. No single length is right for it, so the entry was removed (separate commit on #199).

### Backfill — and what it refused to touch

`web/scripts/fixTheoreticalWeights.ts` rewrites **only** rows whose stored value IS the buggy formula's output, reproduced bit-for-bit as a fingerprint (including the `match(/\d+/)` integer truncation and the `|| 10` tail).

"Recompute everything from the table" would have been a second, quieter version of the same mistake — it would have overwritten the 25 تیرآهن rows carrying **real per-mill weights** (ذوب‌آهن ۱۴ = 155 kg but یزد/فایکو ۱۴ = 135 kg; private mills roll تیرآهن lighter) and the five لوله مانیسمان rows corrected by hand on 2026-08-19 from ASME B36.10M sch40.

| | |
|---|---:|
| active SKUs examined | 686 |
| not the bug's output — untouched | 291 |
| bug-written but coincidentally correct (round bar) | 194 |
| **changed** | **201** |

**4 recomputed** — hand-verified against مرکزآهن's own published 6 m column, exactly:

| SKU | old | new | مرکزآهن 6 m |
|---|---:|---:|---:|
| نبشی ۶ | 2.7 | **34.0** | 33.95 |
| نبشی ۸ | 4.7 | **60.4** | 60.36 |
| نبشی ۱۰ | 7.4 | **94.3** | 94.32 |
| نبشی ۱۲ | 10.7 | **135.8** | 135.82 |

**197 cleared to null** across 37 sub-categories. The 194 میلگرد rows were verified as exactly `d²/162 × 12` before the run and left untouched.

Post-apply — every remaining non-null weight is either verified real data or computed from a published table:

```
      cat      |        sub        |  n  |  mn  |  mx
---------------+-------------------+-----+------+-------
 angle-channel | nabshi            |   4 |   34 | 135.8
 ibeam         | tirahan           |  25 |  125 |   510
 pipe          | seamless-internal |   5 | 67.7 | 255.3
 rebar         | deformed          | 194 |  4.7 |  75.9
```

Re-running reports **0 changes**.

---

## 3. The «عدد» (piece) unit + کوپلر میلگرد ([#200](https://github.com/Am1eza/Iron/pull/200))

**No migration was needed** — `skus.unit` is plain `text` in Postgres with no native enum and no CHECK constraint (verified against the live schema before assuming). The Drizzle `enum` is a TypeScript union, so the **compiler** is the enforcement.

Reusing `branch` would not have been a wording problem — it would have been a pricing one. A `branch` price is per kilogram here, so a `branch` coupler would render «شاخه کوپلر» **and** price each line at `unitPrice × theoreticalWeightKg × qty` — zero today (weight is null), or a fabricated tonnage if one were ever filled in.

### Every kg-based path opts `piece` out explicitly

| path | behaviour |
|---|---|
| `leads.service.priceItems` | `weightKg` undefined; `lineTotal = qty × unitPrice`. Also excluded from the `pieceRequest` conversion — «۲۰ عدد» against a kg-priced SKU is a mismatch, not a convertible claim |
| `estimate.service` | same carve-out |
| `tenderEstimate.factoryOptionsFor` | `weightKgPerUnit` is `null`, not `1` |
| `CostCalculator` | the شاخه/کیلوگرم toggle offers two wrong answers for a piece product — hidden; collapses to qty × unitPrice, no «وزن کل» row |
| `PriceTable` | caption «تومان / عدد»; weight column «نامشخص»; the page-wide «برای هر کیلوگرم» note is **dropped entirely** on a mixed table rather than printing a blanket claim wrong for some of its own rows |

The compiler earned its keep: it caught `AdminSku['unit']` and the **proforma page's unit ternary**, whose bare `: 'متر'` fallback would have printed every coupler line as «متر» on the one document the customer keeps.

Deduplication done along the way: the unit union was hand-maintained in two places and the Persian labels in six. `domain.ts` now owns `PRICE_UNIT_VALUES` (browser-safe — the schema module pulls in `pg`), `schema/catalog.ts` re-exports it as `PRICE_UNITS`, and six Zod schemas that had their own copies now reference it. `WHOLE_PIECE_UNITS` gains `piece`; `defaultUnitFor` takes the sub-category so the admin form prefills «عدد» for کوپلر.

### The data — 65 SKUs, re-verified live

7 types × sizes ۱۶–۴۰, 28,750 – 2,530,000 تومان per عدد. The نوع goes in the **name** («کوپلر میانی استاندارد ۲۰»), exactly as ahanonline names the row — not into `grade`, which in this catalog means A2/A3/ST37 and is already a rendered column on the میلگرد table. `factory` is null (that page publishes no برند) and `theoretical_weight_kg` is null.

- **All 26 sampled prices** (میانی استاندارد ۱۶–۴۰, انتهایی ۱۶–۴۰, تبدیل ۱۶-۱۸…۳۶-۴۰) re-fetched live and matched the saved scrape exactly.
- The «احتساب ارزش افزوده» checkbox is **not** `checked` in the served HTML → ex-VAT → `vat_included = false`, matching all 543 rows the previous pass wrote.
- The 2,530,000 outlier (کوپلر بغل پیچ ۴۰) is present verbatim in the live HTML and monotonic across sizes — bolted couplers genuinely sit in that tier.

After: 65 SKUs, 65 priced, 1 distinct unit, **0 weights**, 65 matching `price_points`.

Tests: 4 new piece cases in `leads.pricing.test.ts` (including a direct regression guard that a stored weight is *ignored* rather than multiplied) and a new 5-case `PriceTable.pieceUnit.test.tsx`.

---

## 4. Part 1 — 43 SKUs retired, 3 prices sourced ([#202](https://github.com/Am1eza/Iron/pull/202))

### Where the fabricated SKUs came from

`lib/mock/catalogData.ts` slices **one** size list per category across that category's sub-categories at random and pairs each with a random mill. That is why «ورق رنگی ۲۰» exists: the ورق size list runs 0.5–40 mm and the رنگی sub-category drew the thick end.

These rows render today. Their July prices are withheld as stale, so a visitor sees a real-looking product row saying «تماس بگیرید» — and the call that follows is about something nobody can sell them.

### The bar applied

Every group was **re-verified against a live source during this pass**, not taken from the earlier audit, and the rule was deliberately strict: deactivate only where the stored size exceeds even the widest **producible** range any source states — not merely what is listed for sale today.

**That check corrected three groups the earlier audit had wrong:**

| group | audit said | actually | outcome |
|---|---|---|---|
| ورق آجدار | 3–10 mm, flag 5 | ahanonline's own filter lists 2/2.5/3/4/5/6/8 | ۲ and ۲.۵ are **real** — kept |
| مفتول گالوانیزه | 2.2–4 mm, flag 4 | مرکزآهن production page: 0.5–6 mm | ۵.۵ and ۶.۵ **kept** |
| لوله مبلی | "dimensioned in mm, not inches" | true of پروفیل مبلی; round لوله مبلی *is* sold in inches | all 4 **left alone** |

### Retired — 43, each with a live source

| line | sizes | n | evidence (all fetched 2026-08-20) |
|---|---|---:|---|
| ورق رنگی | ۵–۲۰ mm | 7 | whole listing is 0.48–0.6 mm |
| لوله اسپیرال | ½–۲½ اینچ | 7 | helically wound from coil; listing starts at 16" |
| ورق اسیدشویی | ۱۲–۳۰ mm | 5 | 1.5–6 mm (مرکزآهن + فولاد ایرانیان + آهن ملل) |
| لوله داربستی | ½–۲ اینچ | 5 | every mill on the page lists 1½" and nothing else |
| ورق عرشه فولادی | ۲–۴ mm | 4 | 0.7–1.25 mm; ۰.۷ and ۱.۵ left alone |
| پروفیل مبلی | ۷۰×۷۰–۱۰۰×۱۰۰ | 4 | listing tops out at 60×60 / 40×80 |
| ورق آجدار | ۰.۷–۱.۵ mm | 3 | hot-rolled patterned plate, 2–8 mm |
| سپری | ۸/۱۰/۱۲ | 3 | rolled in 3, 4, 5, 6 only |
| مفتول گالوانیزه | ۸/۱۰ mm | 2 | drawn 0.5–6 mm |
| ورق گالوانیزه | ۸/۱۰ mm | 2 | 0.3–3 mm listed, 0.18–6 mm producible |
| ورق روغنی | ۴ mm | 1 | 0.4–2 mm listed, 0.3–3 mm producible |

### هاش — the question the brief asked, answered

The 2026-08-19 pass left all 12 هاش SKUs unpriced, judging ahanonline's هاش page unreliable on brand. **Re-checked against two further sources, and a domestic figure does hold:**

- ahanonline lists «HEA ۲۰ / برند ذوب آهن / واحد kg» at **200,000** (updated 1405/5/29).
- **مرکزآهن independently lists HEA ذوب آهن at 200,000** for sizes 14/18/20 — an exact match.
- kilooton's ذوب آهن HEB band (175,000–250,000, dated 28 Mordad 1405) sits around it.

The 2.2× premium over تیرآهن that looked implausible has a cause: هاش is rolled domestically by essentially one mill in limited sizes, so it trades near import parity.

**Written: 1 SKU** — «هاش سبک (HEA) ۲۰ ذوب‌آهن اصفهان» → 200,000 T/kg. It is the **only** هاش SKU whose stored mill is actually a هاش producer. The other 11 are §7 decision #2.

Also written, two sources each: **مفتول گالوانیزه ۳ and ۴ → 109,090** (ahanonline publishes one price for every galvanised size 2.2–4 mm, 0% movement, no mill named, so a mill mismatch cannot move it; cross-checked against فولاد توفیقی at 103,118, −5.5%).

### Prices deliberately NOT written

- **تیرآهن فایکو ۱۶/۲۰/۲۲/۲۴, اهواز ۱۶, ظفر بناب ۱۶** (6) — neither ahanonline nor مرکزآهن publishes a size-16+ row for those mills; only ذوب‌آهن does, so no cross-mill median is possible.
- **نبشی ۱۴/۱۶/۱۸** — ahanonline's نبشی listing stops at 120 mm.
- **سپری ۵/۶** — ahanonline publishes 81,020–81,950 T/kg but from a single brand (نورد سجاد) against our جاوید بناب / سپهر ایرانیان; no cross-mill median, so it stays a reference, not a price.
- The remaining stale rows keep showing «تماس بگیرید», which is the safe state — no wrong number is displayed.

---

## 5. Part 2 — filling empty sub-categories

229 SKUs across 10 lines, from 473 rows scraped off 17 ahanonline `/product-category/*` pages on 2026-08-20. robots.txt was re-read first: `/PriceList/*` and `*price-list*` remain `Disallow`ed and were untouched; `/product-category/*` is not. ~3.5 s between requests. Parsed from `data-price` attributes in the served HTML, not rendered text.

| sub-category | new SKUs | band (تومان) |
|---|---:|---|
| ورق رنگی (refilled) | 15 | 168,454 – 176,472 |
| ورق اسیدشویی (refilled) | 5 | 131,454 – 132,773 |
| لوله اسپیرال (refilled) | 20 | 112,818 – 124,090 |
| **میلگرد ساده** | 15 | 67,545 – 74,727 |
| **ورق شیروانی** | 9 | 169,090 – 172,090 |
| **ورق کرکره** | 6 | 153,272 – 157,636 |
| **ورق استیل** | 47 | 406,500 – 1,109,090 |
| **تسمه** | 93 | 73,636 – 115,000 |
| **چهارپهلو** | 14 | 79,690 – 97,340 |
| **چهارپهلو آلیاژی** | 5 | 109,090 |

The first three had been *emptied by* §4 — their only SKUs were the fabricated ones — so retiring them and refilling with the real products happened in the same pass.

### Three findings worth recording

- **The scraper's `group` label can be off by one table.** It derives from the nearest preceding heading; one میلگرد ساده row's group reads «مازندران» while its own `data-name` reads «امیرآباد». That line now parses `data-name` (authoritative); the others were cross-checked row-by-row and agree.
- **ahanonline's شیروانی page serves «کرکره ای رنگی» rows** and its کرکره page serves both گالوانیزه and رنگی — the same three هفت‌الماس ۰.۴۸ rows appear on both at identical prices. Split by coating so the two sub-categories cannot hold duplicates of one product.
- **A JS `\b` never matches after Persian text** (word boundaries are ASCII-only), so the first version of the میلگرد ساده name regex silently matched nothing. Caught because the dry-run reported "19 source rows, 19 skipped, 0 new".

### Left empty on purpose, each with a reason

- **ساندویچ پانل** — 6 real, today-dated rows exist, all priced per «متر مربع». `PRICE_UNITS` has no square-metre member. See §7 decision #3.
- **لوله مانیسمان خارجی** — 42 real imported rows exist, all per شاخه. Converting needs an ASME B36.10M weight per (size, رده), and doing that arithmetic reproduces the 2026-08-19 pass's finding: the implied per-kg runs **175,369 → 299,529** across neighbouring sizes of the *same* schedule from the same channel (۱½ اینچ at 299,529 against ۳ اینچ at 175,369). A 1.7× swing inside one product line is not a price curve. Nothing published.
- **تسمه فابریک** (25 of the 118 تسمه rows) — 36,454–38,000 T/kg against 73,636 for نوردی and 111,363 for ماشینکاری on the same page, same date, same product. Half the price of میلگرد for a rolled flat bar fails the 60,000–260,000 sanity band. نوردی and ماشینکاری were loaded.
- **7 آلومینیوم + 7 استنلس استیل lines** — see §6.

---

## 6. Part 3 — چهارپهلو

Confirmed real and legitimate: solid square/rectangular section bar stock, sold in two quality tiers (نرمال / ترانس) plus a separate alloy line.

**It does NOT go under ورق.** ahanonline files it at `/product-category/انواع-ورق/چهارپهلو/`, but it is a solid section, not a flat sheet — their URL structure is not a signal for our taxonomy. Both new sub-categories are under **`profile` (پروفیل و قوطی)**.

Two sub-categories, not one and not three, following the repo's established pattern of «SKU-level fields carry the variant, not a proliferation of near-duplicate sub-categories»:

- **`profile/chaharpahlu` (چهارپهلو)** — holds **both** نرمال and ترانس, with the tier in `skus.grade`, which the پروفیل price table already renders as «گرید». ahanonline tables them separately but under one category page with حالت as a column, and they are the same product at two quality tiers.
- **`profile/chaharpahlu-alloy` (چهارپهلو آلیاژی)** — its own sub-category, because ahanonline treats it as a structurally separate line (its own URL, its own production route — continuous-cast alloy billet, rolled) and its alloy designation is a different axis (`grade = 'CK 45'`).

Both carry `group_label = 'چهارپهلو'`, so they render under one heading in nav and breadcrumbs without a third taxonomy level.

**On the sizes — the page's prose disagrees with its own table.** The description mentions «۵، ۶، ۸، ۹، ۱۰، ۱۲، ۱۴، ۱۶ سانتی‌متر», but the actual priced listings are in **millimetres**: نرمال 20×20, 22×22, 30×30, 30×50, 40×40, 50×50, 60×60, 80×50, 100×100, 120×50, 120×80, 120×120 (12) and ترانس 16×16, 18×18 (2); آلیاژی CK 45 at 20×20 … 60×60 (5). **The listings are what got loaded**, per the brief's instruction not to take the prose at face value.

**19 real SKUs**, all `unit = 'kg'`, `theoretical_weight_kg` NULL (no branch length is published), `factory` NULL (their table publishes a delivery point, «بنگاه تهران», not a mill).

---

## 7. The 16 sub-categories still empty

| دسته | زیردسته | why |
|---|---|---|
| فلزات رنگی | نبشی، سپری، لوله، میلگرد، سیم‌جوش آلومینیوم (5) | ahanonline's آلومینیوم root re-fetched: **zero** priced rows |
| فلزات رنگی | بوشن مسی، میلگرد مسی (2) | same |
| استیل | فلنج، مش، رینگ، فنر، تسمه، تیوب، توری استنلس استیل (7) | ahanonline's استنلس‌استیل root re-fetched: **zero** priced rows |
| لوله | لوله مانیسمان خارجی | real rows exist but are per-شاخه — §5 |
| ورق | ساندویچ پانل | real rows exist but are per-متر مربع — §8 #3 |

**Other sources were checked, as the brief required.** The concrete result:

- **مرکزآهن does publish aluminium** (`markazeahan.com/product-category/aluminum/`, dated 1405/05/28): **نبشی آلومینیوم at 630,000 T/kg** across all sizes, plus ورق آلومینیوم (665,000–704,000, برند اراک/پارس) and پروفیل آلومینیوم (650,000). **میلگرد آلومینیوم shows «تماس بگیرید»**; لوله, سپری and سیم‌جوش آلومینیوم are not listed there at all.
  I did **not** write these. Every other price in this pass required two independent sources agreeing, and مرکزآهن is the only one carrying them — filling 1 of 7 lines on a single source would be below the bar applied everywhere else. **This is a ready lead, not a dead end** (§8 #4).
- **Stainless fittings** (فلنج / توری / مش / رینگ) are carried by specialist vendors (ahanspot, فولاد توفیقی, سون استیل) but as quote-on-request rather than published tables. No usable number.

---

## 8. Decisions that need the owner — nothing was guessed

1. **55 more rows hold a per-unit price in the per-kilogram column** — `angle-channel/val-post` (8, per piece), `felezat-rangi/copper-pipe` (45, per 15 m coil), `sheet/perforated-black` (2, per sheet), all written by the 2026-08-19 pass. Unlike the تیرآهن rows in §1 these **fail safe**: their `theoretical_weight_kg` is NULL, so `lineTotal` is undefined and `allPriced` goes false — the line routes to a human instead of auto-quoting. What is wrong is only the caption: «۱۶٬۴۹۲٬۳۸۰ تومان / کیلوگرم» on a copper coil. They cannot be fixed the §1 way — there is no published weight for a copper coil or a وال پست to divide by. **The real fix is a schema change: a column recording what a price is denominated in.** That is a design decision, not a backfill.
2. **11 of the 12 هاش SKUs carry a mill that does not roll هاش** — فایکو, آریان فولاد, یزد احرامیان, جهان فولاد غرب, ماهان سپاهان. Fix-the-mill vs retire-the-SKU is a catalog decision. A defensible domestic price now exists (§4) and can be applied the moment the attribution is settled. (Raised by the 2026-08-19 pass too; still open.)
3. **ساندویچ پانل needs a «متر مربع» unit.** 6 real, today-dated rows are ready to load. Adding `'sqm'` to `PRICE_UNITS` is the same one-line, migration-free change as `'piece'` — but `'piece'` was explicitly approved and this has not been.
4. **Aluminium: مرکزآهن as a second price source.** Approving it (or naming another) unlocks نبشی آلومینیوم immediately, and ورق/پروفیل آلومینیوم if those lines are wanted. میلگرد/لوله/سپری/سیم‌جوش آلومینیوم and all 7 stainless-fitting lines need a supplier, not another scrape.
5. **A per-SKU length field for نبشی / ناودانی.** Both 6 m and 12 m are genuinely sold. The 4 نبشی weights written in §2 assume the 6 m branch (ahanonline's dominant «حالت»). If you sell 12 m in any of these lines, those numbers are 2× low and the catalog needs a length column rather than a per-line constant.
6. **تسمه فابریک's 36–38k T/kg** — either ahanonline has a bad row or فابریک تسمه is a materially different product from نوردی/ماشینکاری. Worth one phone call; 25 SKUs are waiting on the answer.

---

## 9. Part 4 — factory links ([#198](https://github.com/Am1eza/Iron/pull/198))

The per-factory SEO landing pages were live but nothing in a price table pointed at one. The کارخانه cell — in both the desktop `<td>` and the mobile card — now renders a `FactoryCell` linking to `/prices/[category]/factory/[factory]`, with the segment derived by `factoryFacetSlug`, the same function `catalogRepo.publicCatalogPaths` registers the path with and the page resolves its segment with, so the three cannot drift.

The category segment is `r.categoryId` (which carries the **slug**), i.e. the row's own category, not the page's — a cross-listed SKU renders under `/prices/steel` while living in `sheet`, and the home category is the one whose facet page is guaranteed to contain it. A row with no factory keeps its plain «نامشخص»: that route `notFound()`s an empty facet. Styling untouched (reuses `.nameLink`).

4 new tests cover a real factory, a cross-listed row, a null factory and a factory literally stored as «نامشخص».

---

## 10. Verification

### Quality gates

- `tsc --noEmit` clean on every branch.
- `next lint` — no errors and no new warnings on any touched file.
- Full unit suite green: **170 files / 1769 tests** (up from 169/1763 — 13 new tests: 4 factory-link, 5 piece-unit UI, 4 piece-unit pricing, plus 5 added weight-basis cases).
- Every DB script dry-ran, was reviewed, then `--apply`'d, then re-queried. **All five re-run to zero changes** (idempotent).

### Live database, after

```
 active_skus | inactive | with_price | publishable | active_subs | empty_active_subs | price_points
-------------+----------+------------+-------------+-------------+-------------------+--------------
         937 |       87 |        930 |         840 |          77 |                16 |        22730
```

Sample verification against the source site was done by **re-fetching live**, not by re-reading the saved dump: 26 coupler prices, the تیرآهن per-kg cross-check (7 mills), the هاش cross-check (3 sources), and the size-range check behind all 11 retirement groups.

### Files

- `web/scripts/fixTheoreticalWeights.ts` · `seedCouplers.ts` · `retireImpossibleSkus.ts` · `fillCatalogGaps.ts` · `fixBranchPricedTirahan.ts` — all dry-run by default, `--apply` to write.
- `.claude/audits/catalog-gap-fix-2026-08-20/` — the 473-row scrape, its fetchers and its parser.

### Deployed and re-verified live

`main@48eaf81` → `ghcr.io/am1eza/iron-web:48eaf815…`, running in `ahantime-web-1`.
Checked through Caddy after the container came up:

```
200  https://ahantime.com/                 (public)
307  https://panel.ahantime.com/           (→ login)
404  https://ahantime.com/admin            (hidden on the public host)
```

| what | evidence on the live site |
|---|---|
| «عدد» unit | `/prices/rebar/coupler` renders **65 × «تومان / عدد»** and the page note «قیمت‌ها به تومان و برای هر عدد است.» |
| تیرآهن fix | `/prices/ibeam/tirahan` serves **۸۹٬۱۵۰ تومان / کیلوگرم**; ۱۳٬۸۱۸٬۱۸۱ is gone |
| factory links | `/prices/rebar` emits real `/prices/rebar/factory/<slug>` hrefs |
| چهارپهلو | `/prices/profile/chaharpahlu` renders 14 rows with the «گرید» column carrying نرمال/ترانس |
| retirements | `/prices/sheet/colored` shows only ۰.۴۸ / ۰.۵ / ۰.۶ mm; `/prices/pipe/scaffold` only ۱½ اینچ |
| bundle | `تومان / عدد` is present in the container's `.next/` output |

One local-only caveat worth stating rather than hiding: a full `vitest run` on this
host intermittently times out `seedDatabase — articles` (2 tests) under parallel
load. They pass in isolation (~10 s each) and passed in CI on every one of the six
PRs. Unrelated to this work.

### Out of scope, untouched as instructed

The products/Navbar mega-menu redesign, and the FAQ / article / comments-under-factory-page work. The `feat/price-table-by-factory` worktree was left alone.

---

<a id="catalog-owner-decisions-report"></a>

## Source: `CATALOG_OWNER_DECISIONS_REPORT.md`

# گزارش شش تصمیم مالک — مبنای قیمت، هاش، متر مربع، آلومینیوم، طول شاخه، تسمه فابریک

**Resolving the six owner-decisions left open by `CATALOG_GAP_FIX_REPORT.md` §8**

- Run: 2026-08-20, against the live database (`ahantime-db-1`) and `main`.
- Every DB-mutating script dry-ran first, was reviewed, then `--apply`'d, then the live DB was
  re-queried, then the rendered page was checked through Caddy. All four scripts re-run to
  **zero further changes**.
- **Nothing was hard-deleted.** One SKU (هاش سنگین ۲۷) was soft-deleted (`is_active = false`);
  its row, price history and any lead referencing it survive, and one UPDATE reverses it.
- Shipped as **one PR — [#205](https://github.com/Am1eza/Iron/pull/205)** — merged to `main` as
  `4fc302d`, built to `ghcr.io/am1eza/iron-web:4fc302d3…` and deployed. Items 1–5 are code and
  data that share one schema change, so splitting them into five PRs would have meant four
  rebases over the same migration for no reviewer benefit.

| # | decision | outcome |
|---|---|---|
| 1 | Price-unit-basis column (the "55 more rows") | **Done** — `price_basis` + `branch_length_m`, 149 rows migrated, all money-path call sites |
| 2 | هاش mill misattribution (11 of 12 SKUs) | **Done** — 10 mills corrected + priced, 1 retired |
| 3 | «متر مربع» unit for ساندویچ‌پانل | **Done** — unit added, 6 rows loaded |
| 4 | مرکزآهن as an approved aluminium source | **Done** — 108 SKUs across 5 lines, incl. two the brief thought had no source |
| 5 | Per-SKU branch-length field | **Done** — column added, 4 نبشی + 25 تیرآهن + 45 لوله مسی + 27 آلومینیوم rows filled |
| 6 | تسمه فابریک price anomaly (25 SKUs) | **NOT resolved — still needs the owner's phone call.** Research made it *less* explicable, not more. §6 below. |

---

## 0. Headline

| | before | after |
|---|---:|---:|
| Active SKUs | 937 | **1,050** |
| …publishable price (fresh, not stale) | 840 | **963** |
| Inactive (soft-deleted) SKUs | 87 | 88 |
| Active sub-categories | 77 | **79** |
| Active sub-categories with zero products | 16 | **12** |
| Distinct price **units** in use | 4 | **5** (`kg` 898 · `branch` 79 · `piece` 65 · `sqm` 6 · `sheet` 2) |
| Distinct price **bases** in use | — (the column did not exist) | **6** (`kg` 924 · `piece` 65 · `coil` 45 · `branch` 8 · `sqm` 6 · `sheet` 2) |
| SKUs carrying a `branch_length_m` | — | **101** |

Per category, after:

| دسته | active | قابل انتشار |
|---|---:|---:|
| میلگرد | 326 | 325 |
| ورق | 239 | 228 |
| فلزات رنگی | 180 | 180 |
| لوله | 67 | 46 |
| پروفیل و قوطی | 61 | 53 |
| استیل | 55 | 55 |
| تیرآهن | 45 | 29 |
| کلاف و مفتول | 40 | 25 |
| نبشی و ناودانی | 37 | 22 |

فلزات رنگی went 72 → 180 (§4) and تیرآهن's publishable count went 20 → 29 (§2); ورق gained the
6 ساندویچ‌پانل rows (§3).

---

## 1. The price-basis column — what a stored price is denominated in

### The problem, restated precisely

`current_prices.price` was per KILOGRAM for every unit except `piece`. That invariant lived in
prose (`leads.service.priceItems`) and was re-asserted at five call sites. It was **false for 74
live rows**:

- The 19 تیرآهن rows fixed in the data by #201, which auto-quoted a branch at **155×**.
- 55 more that could not be fixed that way, because there is no published weight for a copper
  coil or a وال پست to divide by:

| sub-category | n | actually priced per | rendered, before |
|---|---:|---|---|
| `felezat-rangi/copper-pipe` | 45 | one کلاف ۱۵ متری | «۱۶٬۴۹۲٬۳۸۰ تومان / کیلوگرم» |
| `angle-channel/val-post` | 8 | one قطعه | «۲٬۳۷۱٬۶۷۶ تومان / کیلوگرم» |
| `sheet/perforated-black` | 2 | one برگ | «۴٬۹۶۶٬۸۱۸ تومان / کیلوگرم» |

They failed *safe* — `theoretical_weight_kg` is NULL, so no total could be computed, `allPriced`
went false and the line routed to a human. But only by accident of a missing column.

### The design

Two columns, added by migration `0042` (additive; all three `price_basis` columns are NOT NULL
with a `'kg'` default, which is exactly what every pre-existing row always meant — no row changed
meaning and no backfill was needed for the other ~900):

- **`skus.price_basis`**, mirrored onto **`current_prices.price_basis`** and
  **`price_points.price_basis`** — `kg | branch | coil | sheet | piece | sqm`. Mirrored the same
  way `unit` already is, so a history point stays readable after a SKU's denomination is
  corrected.
- **`skus.branch_length_m`** — the length of one شاخه/کلاف, in metres.

Three deliberate choices:

1. **`branch` and `coil` are two members, not one.** The arithmetic is identical
   (`PRICE_BASIS_COUNTING_UNIT` maps both onto the `branch` unit); they exist so the caption can
   say which — «تومان / شاخه ۶ متری» versus «تومان / کلاف ۱۵ متری».
2. **The length lives on the SKU, not on the price row.** It is a property of the product. Putting
   a length on `current_prices` as well would be a second place for it to be wrong — which is the
   whole failure mode this column exists to end.
3. **`price_basis` is independent of `unit`.** `unit` says what `qty` counts in; `price_basis`
   says what the money is per. Every one of the 55 rows was a case where the two differ.

### The money path

`leads.service.priceItems` and `estimate.service.estimateItems` were two hand-copied versions of
the same arithmetic, and both had already shipped the identical qty-vs-weight bug once. They now
share one module, `lib/utils/priceMath`:

- basis `kg` → `unitPrice × weightKg` (unchanged for the ~900 rows that are per-kilogram).
- any other basis → `unitPrice × qty`, **but only when the line counts in the same whole thing the
  price is per**. «۲۰ کیلوگرم» of a per-coil product produces **no total** and routes to a human —
  the same fail-safe `unitMismatch` already used, rather than a plausible-looking wrong number.

Every call site from the «عدد» PR was revisited:

| path | behaviour now |
|---|---|
| `leads.service.priceItems` | reads `priceBasis`; the `pieceRequest` («۲۰ شاخه میلگرد») conversion additionally requires the SKU to *be* per-kilogram |
| `estimate.service` | calls the same two functions instead of duplicating them |
| `tenderEstimate.factoryOptionsFor` | `weightKgPerUnit` is `null` for **every** non-kg basis, not just `piece` |
| `CostCalculator` | the شاخه/کیلوگرم toggle is hidden for every whole-item basis (both answers would be wrong); quantity may be fractional only for `sqm` |
| `PriceTable` | row caption + page-wide note read the basis; a **mixed** table, where the note must be dropped, now prints the basis per row on the desktop table too — before this it printed bare numbers with nothing on the page saying what they were per |
| `SkuDetail` | «قیمت هر …» and the «واحد فروش» spec row read the basis; a «طول شاخه» row appears when one is recorded |
| `search`, `proforma`, cart, admin lead drawer | captions/labels from one shared table |

Along the way, four hand-copied `Record<PriceUnit, string>` label maps (cart, admin lead drawer,
admin lead-item route, پیش‌فاکتور) collapsed into one `PRICE_UNIT_LABEL`. `track/TrackLookup`
keeps its own on purpose — it renders `kg` as «تن», which nothing else does; that is left exactly
as found rather than changed as a side effect.

### The data — 149 rows, `scripts/setPriceBasis.ts`

| sub-category | n | → basis | length | evidence (fetched 2026-08-20) |
|---|---:|---|---:|---|
| `rebar/coupler` | 65 | `piece` | — | ahanonline publishes «واحد: عدد» on all 65 |
| `felezat-rangi/copper-pipe` | 45 | `coil` | 15 m | ahanonline's «حالت» column reads «۱۵ متری» on every row |
| `angle-channel/val-post` | 8 | `branch` | — | see below |
| `sheet/perforated-black` | 2 | `sheet` | — | the price tracks the sheet's own ابعاد |
| `angle-channel/nabshi` | 4 | — | 6 m | §5 |
| `ibeam/tirahan` | 25 | — | 12 m | §5 |

**کوپلر moving first is not cosmetic.** Those 65 rows already priced correctly, via a
`unit === 'piece'` special case. With the denomination in a column that special case is gone, so
leaving them on the default `'kg'` basis would have stopped every coupler line quoting. They move
in the same transaction.

**لوله مسی cross-checks arithmetically, twice.** ¼″ × 0.63 mm over 15 m is ~1.52 kg of copper at
3,634,385 تومان; ¾″ × 0.63 mm is ~4.9 kg at 11,763,932. Both imply **~2.39M تومان/kg** — one
constant rate across the whole range, which is what a per-coil price looks like and what a
per-kilogram price cannot be. And independently: the catalog's own تسمه مسی (2,520,000 T/kg) and
ورق مسی (2,481,818 T/kg), both stored and displayed as per-kilogram, sit right on that figure.

**ورق پانچ likewise.** ۲۰۰۰×۱۰۰۰×۲ mm at 3,226,818 and ۲۵۰۰×۱۲۵۰×۲ mm at 4,966,818 both imply
~102,000 T/kg — one rate, two sheet sizes, i.e. a per-sheet price.

**وال پست: `branch`, and no length.** This one is honestly the least clean of the four, and the
report should say so. ahanonline publishes no «واحد» column for وال پست, and its prose paragraph —
a generic ناودانی explainer — says price tables are «به ازای هر کیلوگرم», which the numbers flatly
contradict (108,406–2,371,676 for a وال پست is not a kilogram price of anything). Dividing the
eight prices by ~73,000 T/kg gives 1.5–32 kg, entirely ordinary masses for these pieces, so they
are per-item, and «شاخه» is both what the trade calls one and what `skus.unit` already said. The
`سایز` column («۱۰×۲۰» … «۲۰×۳۰۰») most likely encodes a ناودانی size and a length in centimetres,
but that is an inference, so **no `branch_length_m` was written** — the caption reads «تومان /
شاخه» and stops there rather than inventing a length.

### Before / after, live

```
$ psql -c "select price_basis, count(*) from skus where is_active group by 1"
 kg 924 · piece 65 · coil 45 · branch 8 · sqm 6 · sheet 2      (was: column did not exist)
```

Through Caddy, after the deploy:

| page | before | after |
|---|---|---|
| `/prices/felezat-rangi/copper-pipe` | 45 × «تومان / کیلوگرم» | **45 × «تومان / کلاف ۱۵ متری»**, note «قیمت‌ها به تومان و برای هر کلاف ۱۵ متری است.» |
| `/prices/angle-channel/val-post` | 8 × «تومان / کیلوگرم» | **8 × «تومان / شاخه»** |
| `/prices/sheet/perforated-black` | 2 × «تومان / کیلوگرم» | **2 × «تومان / برگ»** |
| `…/copper-pipe/…-1-2-zkhamt-0-75-babk` | «قیمت هر کیلوگرم», «واحد فروش: کیلوگرم» | **«قیمت هر کلاف ۱۵ متری»، «واحد فروش: کلاف ۱۵ متری»، «طول شاخه: ۱۵ متر»** |
| `/prices/felezat-rangi` (mixed bases) | bare numbers, no note, nothing saying what they were per | note dropped **and** every desktop row carries its own «/ کیلوگرم» or «/ کلاف ۱۵ متری» |
| `/prices/rebar/coupler` (regression check) | 65 × «تومان / عدد» | **unchanged** |
| `/prices/rebar/deformed` (regression check) | 194 × «تومان / کیلوگرم» | **unchanged** |
| `/search?q=لوله مسی` | «تومان / کیلوگرم» per hit | **«تومان / کلاف ۱۵ متری»** per hit |

### Tests — one per denomination

- `lib/utils/priceMath.test.ts` — 18 cases: the kg conversion, the whole-item multiplication for
  each of `branch`/`coil`/`sheet`/`piece`/`sqm`, "no mass in the chain for any non-kg basis even
  with a weight on file", and the mismatched-counting-unit refusal on all four shapes.
- `leads.pricing.test.ts` — 6 new cases against a real Postgres, one per basis plus the
  kilogram-quantity-against-a-coil-price refusal.
- `PriceTable.pieceUnit.test.tsx` → `PriceTable.priceBasis.test.tsx` — all six captions, the
  «کلاف ۱۵ متری» length suffix, a guard that a length is *never* appended to a kilogram basis,
  the page-wide note, and the per-row basis on a mixed table.
- `catalogCompose.test.ts` — the ۱۲ متری length override doubling a نبشی weight, rejection of a
  zero/negative/non-finite length, and the sqm/piece prefills.

---

## 2. هاش — 11 of 12 SKUs named a mill that does not roll هاش

### Where it came from

`lib/mock/catalogData.ts` pairs each generated SKU with a **random** mill from its CATEGORY's
list, so هاش inherited تیرآهن's mills. فایکو، آریان فولاد، یزد احرامیان، جهان فولاد غرب and ماهان
سپاهان all roll IPE; none rolls a wide-flange section.

### Four sources, fetched 2026-08-20, and they agree

| source | what it publishes | do any of the five appear? |
|---|---|---|
| **ahanonline** `/تیرآهن-و-هاش/هاش/` | 34 rows, dated 1405/5/29 | **No.** برندs are ذوب آهن / ذوب آهن اصفهان / وارداتی / ترک / ترک-کره |
| **مرکزآهن** `/product-category/هاش/` | 38 rows, dated 1405/5/28 | **No.** ذوب آهن and وارداتی only |
| **kilooton** `/catalog/heb`, `/catalog/hea` | 1405/5/29, bands HEB 175,000–250,000 and HEA 180,000–240,000 | **No.** ذوب آهن and ترک only — and it states it in prose: «در حال حاضر تولید عمده تیرآهن هاش سنگین در ایران توسط فولاد ذوب آهن اصفهان انجام می‌شود», with imports from Turkey, Korea and Spain |
| **شهرآهن** `/hea-heb` | — | **No.** «کارخانه ذوب آهن اصفهان، لیدر تولید تیرآهن بال پهن در ایران است» |

A fifth (**فولاد جهان مهر**) publishes ذوب آهن's own range — HEA ۱۴/۱۶/۱۸/۲۰، HEB ۱۶/۱۸/۲۰, plus
medium-weight هاش ۱۴–۳۰ — which is what settles the two sizes where the two price tables
disagreed about origin.

### Per SKU, with both published figures

| SKU | stored mill | → mill | ahanonline | مرکزآهن | written |
|---|---|---|---:|---:|---:|
| HEA ۱۴ | فایکو | ذوب‌آهن اصفهان | 200,000 | 200,000 | **200,000** |
| HEA ۱۶ | آریان فولاد | ذوب‌آهن اصفهان | 195,454 | listed, unpriced | **195,454** |
| HEA ۱۸ | فایکو | ذوب‌آهن اصفهان | 200,000 | 200,000 | **200,000** |
| HEA ۲۰ | *(already correct)* | — | 200,000 | 200,000 | *(unchanged, #202)* |
| HEA ۲۲ | یزد احرامیان | وارداتی | not listed | listed, unpriced | **— no price written** |
| HEA ۲۴ | آریان فولاد | وارداتی | 200,000 | 200,000 | **200,000** |
| HEB ۱۶ | جهان فولاد غرب | ذوب‌آهن اصفهان | 200,000 | 200,000 | **200,000** |
| HEB ۱۸ | یزد احرامیان | ذوب‌آهن اصفهان | 200,000 | 200,000 | **200,000** |
| HEB ۲۰ | جهان فولاد غرب | ذوب‌آهن اصفهان | 163,636 | 161,818 (Δ1.1%) | **163,636** |
| HEB ۲۲ | جهان فولاد غرب | ذوب‌آهن اصفهان | 195,454 | 200,000 (Δ2.3%) | **195,454** |
| HEB ۲۴ | یزد احرامیان | ذوب‌آهن اصفهان | 209,090 | 209,090 | **209,090** |
| HEB ۲۷ | ماهان سپاهان | **retired** | not listed | not listed | — |

**HEA ۲۲ gets a corrected mill but no price**, and that is the honest answer: مرکزآهن lists the
size (HEA220 is a real DIN 1025-3 section, weight 606 kg over 12 m) but publishes no number, and
ahanonline does not carry HEA ۲۲ at all. It is a real, sellable, imported product with no
published price, so it keeps showing «تماس بگیرید» — the safe state.

**HEB ۲۷ is retired, not re-attributed.** There is no HEB270: DIN 1025-2 runs …۲۶۰، ۲۸۰، ۳۰۰, and
neither table lists a 27 in either series (ahanonline goes ۲۶ → ۳۰، مرکزآهن ۲۶ → ۲۸). Soft-deleted
exactly as the 43 impossible SKUs were in #202.

**The one figure below the corroborating band, stated openly:** HEB ۲۰ at 163,636 sits under
kilooton's 175,000 floor (which is itself quoted for *the same product*, هاش سنگین ۲۰ ذوب آهن).
Two published tables agreeing to within 1.1% beat a third 6.9% away, so 163,636 was written and
the third figure is recorded here.

### What was deliberately not done

**No `theoretical_weight_kg`.** مرکزآهن publishes a per-شاخه weight for every هاش row (HEA۱۴ =
۲۹۷ kg over 12 m, HEB۲۰ = ۷۳۶ kg …) and they match the standard sections, so the data exists and
is good. Filling it would make all ten priced rows **auto-quotable**, which is a commercial change
nobody asked for. Left null, so `allPriced` stays false and the line goes to a human. This is a
ready follow-up if the owner wants it — see §7.

### Before / after, live

Rendered `/prices/ibeam/hash-sabok` and `/prices/ibeam/hash-sangin` after the deploy:

```
تیرآهن هاش سبک (HEA) ۱۴ | ذوب‌آهن اصفهان | ۲۰۰٬۰۰۰      (was: فایکو | ۳۸٬۷۵۰، stale)
تیرآهن هاش سبک (HEA) ۱۶ | ذوب‌آهن اصفهان | ۱۹۵٬۴۵۴      (was: آریان فولاد | ۳۷٬۵۵۰، stale)
تیرآهن هاش سبک (HEA) ۱۸ | ذوب‌آهن اصفهان | ۲۰۰٬۰۰۰      (was: فایکو | ۳۶٬۵۵۰، stale)
تیرآهن هاش سبک (HEA) ۲۰ | ذوب‌آهن اصفهان | ۲۰۰٬۰۰۰      (unchanged)
تیرآهن هاش سبک (HEA) ۲۲ | وارداتی        | تماس بگیرید  (was: یزد احرامیان)
تیرآهن هاش سبک (HEA) ۲۴ | وارداتی        | ۲۰۰٬۰۰۰      (was: آریان فولاد | ۳۹٬۵۰۰، stale)

تیرآهن هاش سنگین (HEB) ۱۶ | ذوب‌آهن اصفهان | ۲۰۰٬۰۰۰
تیرآهن هاش سنگین (HEB) ۱۸ | ذوب‌آهن اصفهان | ۲۰۰٬۰۰۰
تیرآهن هاش سنگین (HEB) ۲۰ | ذوب‌آهن اصفهان | ۱۶۳٬۶۳۶
تیرآهن هاش سنگین (HEB) ۲۲ | ذوب‌آهن اصفهان | ۱۹۵٬۴۵۴
تیرآهن هاش سنگین (HEB) ۲۴ | ذوب‌آهن اصفهان | ۲۰۹٬۰۹۰
  — «هاش سنگین ۲۷» is gone from the page entirely.
```

---

## 3. «متر مربع» (sqm) — the unit, and ساندویچ‌پانل

Built exactly like the «عدد» unit in #200, and the migration-free premise was **re-verified
against the live schema before being relied on**: `skus.unit` is plain `text` in Postgres with no
native enum and no CHECK constraint, so the Drizzle `enum` is a TypeScript union and the compiler
is the enforcement. `information_schema.columns` confirms it. No migration was needed for the
unit itself (the migration in this pass is for `price_basis`/`branch_length_m`, §1).

Everything the «عدد» PR had to touch, touched again:

- `PRICE_UNIT_VALUES` in `domain.ts`, re-exported as `PRICE_UNITS` from the schema module.
- The six Zod schemas that reference it (admin SKU create/patch, tools/estimate, `validation/api`,
  `aiTools`' JSON schema and its Zod mirror) — all derive from the array, so all picked it up.
- `WHOLE_PIECE_UNITS` — **`sqm` is deliberately NOT added.** «۱۲٫۵ متر مربع» is an ordinary order;
  «۱۲٫۵ عدد» is a typo. This is the one place `sqm` behaves unlike every other countable unit, and
  there is a regression test for it.
- `defaultUnitFor` and the new `defaultPriceBasisFor` — both return `sqm` for `sandwich-panel`.
- The proforma page's unit lookup — where the compiler earned its keep again: `Record<PriceUnit,
  string>` refused to compile until «متر مربع» was added, on the one document the customer keeps.
- `CostCalculator`, `PriceTable`, `SkuDetail`, cart, admin lead drawer, tracking page.

### The data — 6 rows

ahanonline's ساندویچ‌پانل listing, **fetched live for this pass** and identical row for row and
ریال for ریال to the scrape the previous pass left ready. Every row dated 1405/5/29 with an
explicit «واحد: متر مربع» column — the script aborts if any row's unit is anything else rather
than assuming.

| نوع | ضخامت عایق | تومان / متر مربع |
|---|---:|---:|
| سقفی | ۴ cm | 3,832,000 |
| سقفی | ۵ cm | 4,131,000 |
| سقفی | ۶ cm | 4,461,000 |
| دیواری | ۴ cm | 3,709,090 |
| دیواری | ۶ cm | 4,245,454 |
| دیواری | ۱۰ cm | 5,665,454 |

Monotonic in thickness within each type, and سقفی above دیواری at equal thickness — the right way
round for a panel that carries load.

**Single-source, and flagged as such.** No other price site in this comparison set publishes
ساندویچ‌پانل at all, so this is not "one source where two disagree", it is "one source where
there is only one". Weight and factory are null: the page publishes neither, and a panel's mass
depends on both face gauges and the foam density.

**Live:** `/prices/sheet/sandwich-panel` returns 200 with 6 rows, all captioned **«تومان / متر
مربع»**, and the sub-category is no longer in the empty list.

---

## 4. آلومینیوم from مرکزآهن — 108 SKUs

The owner approved مرکزآهن as a domestic aluminium price source, so the two-source bar the
previous pass held itself to does not apply to this product line. It is untouched everywhere else
— §2's هاش prices still carry two published figures each.

Re-fetched live 2026-08-20 rather than reused. **Every table loaded is dated ۱۴۰۵/۰۵/۲۸**, and the
script filters on that date itself rather than by hand, so a stale table cannot slip in.

| line | sub-category | n | تومان / کیلوگرم | برند | طول |
|---|---|---:|---:|---|---:|
| نبشی آلومینیوم | `aluminum-angle` | 7 | 630,000 | — | 6 m |
| لوله آلومینیوم | `aluminum-pipe` | 13 | 640,000 | آلوم طرح پاسارگاد | 6 m |
| میلگرد آلومینیوم | `aluminum-rebar` | 57 | 620,000 | — (گرید ۷۰۰۰) | — |
| ورق آلومینیوم | `aluminum-sheet` ★ | 24 | 665,000–704,000 | اراک / پارس، ساده و آجدار | — |
| پروفیل آلومینیوم | `aluminum-profile` ★ | 7 | 650,000 | — | 6 m |

★ new sub-categories — فلزات رنگی had no ورق or پروفیل line.

### Two corrections to the premise this work was handed with

The brief stated that میلگرد/لوله/سپری/سیم‌جوش آلومینیوم «still have **no** source at all
(مرکزآهن doesn't list them either)». Re-fetching shows that is true of two of the four and not of
the other two, and both of those sub-categories already existed and were empty:

- **لوله آلومینیوم** — 13 priced rows at 640,000, dated ۱۴۰۵/۰۵/۲۸. The previous pass missed them
  because مرکزآهن titles that table **«آلوم طرح پاسارگاد»** (the brand) rather than «لوله»; the
  product names inside it all read «لوله آلومینیوم قطر خارجی … ضخامت …».
- **میلگرد آلومینیوم** — گرید ۷۰۰۰ is priced at 620,000, dated ۱۴۰۵/۰۵/۲۸. The report's «تماس
  بگیرید» is accurate for grades 2024/6061/7075, whose tables are stale (۱۴۰۵/۰۲/۱۲) and
  unpriced. Those three are **not** loaded.

I loaded both, because the owner's approval is of the *source* for this *product line* and these
are live, priced, today-dated rows on exactly that source filling sub-categories the previous
report itself listed as gaps. Flagging it here rather than silently: if the intent was narrower,
one `UPDATE skus SET is_active=false` per line reverses it.

**سپری آلومینیوم and سیم‌جوش آلومینیوم really are absent** from مرکزآهن, and stay empty. So do all
7 استنلس fitting lines (فلنج/توری/مش/رینگ/فنر/تسمه/تیوب استنلس) — carried by specialist vendors as
quote-on-request, with no published table anywhere. Those are a supplier gap, not a sourcing-bar
one, and nothing here lowered a bar to fill them.

**ناودانی آلومینیوم is also live and priced** (8 rows at 630,000, برند آلومین گستر, 6 m) but has
no sub-category in this catalog and was not in the brief's list. **Reported, not loaded** — say
the word and it is a ten-minute follow-up.

### What was deliberately not written

**No `theoretical_weight_kg` for any of the 108.** مرکزآهن's نبشی and ناودانی tables do carry a
«وزن هر شاخه» column, but it contradicts itself:

- نبشی ۱٫۵×۳۰×۲۰ is listed at **1.2 kg** against **1.5 kg** for the *smaller* ۱٫۵×۲۰×۲۰.
- ناودانی ۱۰×۱۳ is listed at **8 kg** against 0.6–1.5 kg for every one of its siblings.

A column with visible internal contradictions is not a published table, and a wrong weight on a
per-kilogram row is a wrong پیش‌فاکتور. Left null — the same refusal `catalogCompose` already
documents for ناودانی سبک/سنگین. `branch_length_m = 6` **is** written where the table states
«طول(m): 6», because that is a stated fact and it is what a future weight would be computed over.

The 4 ورق rows priced «تماس بگیرید» are skipped, not written as zero. The script asserts every
price inside 400,000–1,200,000 T/kg and every slug unique before writing anything.

**Live:** all five pages return 200 — `aluminum-angle` 7 rows, `aluminum-pipe` 13,
`aluminum-rebar` 57, `aluminum-sheet` 24, `aluminum-profile` 7, every one captioned «تومان /
کیلوگرم».

---

## 5. The per-SKU branch-length field

`skus.branch_length_m` (double precision, nullable) — see §1 for the schema. It does two jobs with
one number: it is the length a `branch`/`coil` price is a length *of*, and it is the branch length
a theoretical weight is computed over.

`theoreticalWeightFor(category, size, sub, branchLengthM?)` now takes the SKU's own length and
falls back to `CATALOG_WEIGHT_BASIS`'s documented per-line convention when there is none. A
non-finite, zero or negative override is ignored rather than trusted. `defaultBranchLengthM()`
exposes the convention so the admin form can prefill it and a script can state what it defaulted
to.

### The research the brief asked for — which length each نبشی row actually reflects

ahanonline's نبشی listing (83 rows, re-fetched 2026-08-20, dated 1405/5/29) **does** carry a
«حالت» column, per row, and it genuinely carries both: ۶ متری dominates, but ۱۲ متری rows exist —
ناب تبریز 70×70×5، 80×80×8، 100×100×8 and 100×100×10؛ اشتهارد؛ آونگان 100×100. So a per-line
constant is right for most rows and **exactly 2× wrong** for those.

Each of the four نبشی SKUs carrying a weight was matched to the source row its stored price came
from:

| SKU | stored price | matched source row | حالت |
|---|---:|---|---|
| نبشی ۸ ظهوریان مشهد | 76,590 | «ظهوریان 80×80 ض۸، کارخانه» — exact price match | **۶ متری** |
| نبشی ۱۰ ناب تبریز | 77,280 | «ناب تبریز 100×100 ض۸، کارخانه» (the page's other 77,280 row is a 70×70, i.e. not size ۱۰) | **۶ متری** |
| نبشی ۱۲ ناب تبریز | 78,090 | the only 120×120 rows at 78,090 are آونگان's, both | **۶ متری** |
| نبشی ۶ سپهر ایرانیان | 74,238 | سپهر ایرانیان publishes only 40×40 rows, all | **۶ متری** |

All four are 6 m, so **no weight changed** — 6 m is the value `CATALOG_WEIGHT_BASIS` already
assumed. What changed is that the assumption is no longer silent: the row now says 6 m, and a row
that turns out to be ۱۲ متری can be corrected in the admin panel without a code change.

One honest note on نبشی ۱۲: its stored price matches آونگان's rows while its stored mill says ناب
تبریز, which does not publish a 120×120 at all. That is a mill-attribution question of the same
shape as §2's هاش, not a length question, and it was left alone rather than folded into this pass.

### ناودانی

**There are no active ناودانی SKUs in `angle-channel` today** — `channel-heavy`, `channel-light`,
`navdani-oroupaei` and `navdani-sakhtemani` are all deactivated sub-categories, and §2 of the
previous pass refused ناودانی weights anyway because مرکزآهن and فولاد ایرانیان disagree by 11% on
ناودانی سنگین ۱۴. So no ناودانی row got a weight from this pass and none needed a length. The
column is in place for the moment one does.

### Lengths written

| line | n | length | source |
|---|---:|---:|---|
| `angle-channel/nabshi` | 4 | 6 m | ahanonline's «حالت», per row, matched above |
| `ibeam/tirahan` | 25 | 12 m | «شاخه ۱۲ متری» on every ahanonline تیرآهن row; the stored weights already encode it (ذوب‌آهن ۱۴ = 155 kg = 12.9 × 12) |
| `felezat-rangi/copper-pipe` | 45 | 15 m | ahanonline's «حالت: ۱۵ متری» |
| aluminium نبشی / لوله / پروفیل | 27 | 6 m | مرکزآهن's «طول(m)» column |

**Live:** `/prices/angle-channel/nabshi/angle-channel-angle-3` (نبشی ۱۰) now shows a **«طول شاخه:
۶ متر»** spec row alongside «واحد فروش: کیلوگرم»; the copper-pipe detail page shows «طول شاخه: ۱۵
متر» and «واحد فروش: کلاف ۱۵ متری».

---

## 6. تسمه فابریک — NOT resolved. This one still needs the phone call.

25 SKUs, 36,454–38,000 T/kg on ahanonline against 73,636 for نوردی and 111,363–115,000 for
ماشینکاری on the same page, same date. **Everything research could do was done, and it made the
anomaly harder to explain rather than easier.** No price was written.

### What was checked, and what came back

**1. ahanonline's own description of فابریک — it argues the *opposite* way.**
The page's prose says فابریک is rolled from billet preheated to 1200 °C through heavy rolls to an
exact thickness and width, cut into 6–12 m lengths, and «به‌دلیل یکپارچگی ساختار، از استحکام
بالاتری برخوردار است» — *higher* strength from an integral structure. Independent trade sources
agree: فابریک has a *lower* dimensional tolerance and a more uniform alloy than نوردی. A premium
product at **half** the price of the cheaper one is not explained by a product difference; the
product difference points the wrong way.

**2. The unit is confirmed per-kilogram by a second source, so this is not a mislabelled
denomination.** ahanonline's تسمه table publishes no «واحد» column at all (for any of its three
groups). آهن‌پلاس's تسمه فابریک table does, and it says **کیلوگرم** — though every one of its own
rows reads «تماس بگیرید», so it corroborates the unit and not the number. A per-شاخه or per-بسته
reading is therefore ruled out, which was the most likely benign explanation.

**3. Two other price sources — the anomaly does not reproduce, and their floor is roughly double.**

| source | date | تسمه band published | a فابریک row? |
|---|---|---|---|
| **مرکزآهن** `/product-category/تسمه/` | 1405/05/28 | کوره‌ای 67,272 · آریان 74,727–76,636 · کوهپایه 79,750–83,050 · ورقی 106,591 | **No فابریک line at all** |
| **آهن‌پرایس** `/Price/تسمه-آهن` | 1405/05/28 | تهران 73,636 · کوهپایه 80,454–85,454 | **No فابریک row** |
| شهرآهن `/fabric-straps`, ابوالحلاج | — | — | unreachable (JS-only / account suspended) |

The lowest تسمه price published anywhere across three sites is **67,272 T/kg**. ahanonline's
فابریک rows sit at 36,454–38,000 — roughly **half the market floor**, and below the price of
میلگرد.

**4. The internal price structure is itself odd.** Re-fetched live today, the 25 فابریک rows
depend only on **width** and not at all on thickness:

```
عرض ۱۰۰ / ۱۵۰ mm → 36,454     (12 rows, thicknesses 8, 10, 12, 15, 20, 25)
عرض ۲۰۰ / ۲۵۰ mm → 36,818     (10 rows)
عرض ۳۰۰ mm       → 38,000     ( 3 rows)
```

For a per-kilogram price of a rolled flat bar, a figure that varies with width and is completely
independent of thickness is not a normal price curve. The delivery point is also «قم», where every
نوردی and ماشینکاری row is «بنگاه تهران».

### Verdict

The data is contradictory, not merely thin. The unit is confirmed, the product is confirmed to be
the *premium* one, no other source reproduces the number, and the number is below the published
floor for the whole product family. The remaining step is the one that was flagged in the first
place and that I cannot take: **a phone call to ahanonline or a تسمه supplier** to ask whether
those 25 rows are a bad row, a different product, or a genuinely different commercial basis.

**The 25 SKUs were not priced and nothing was guessed.** They continue to show «تماس بگیرید»,
which is the safe state — no wrong number is displayed and the call routes to a human. The parsed
rows are saved in `.claude/audits/catalog-owner-decisions-2026-08-20/` for whoever makes the call.

---

## 7. Still open, and why

| item | status |
|---|---|
| **تسمه فابریک، 25 SKUs** | §6 — needs a supplier call. Everything research can settle is settled. |
| **هاش theoretical weights** | مرکزآهن publishes a good per-شاخه weight for all 12 sizes and they match the standard sections. Filling them makes the ten priced هاش rows auto-quotable, which is a commercial decision, not a data fix. One script away if wanted. |
| **ناودانی آلومینیوم** | **Done 2026-08-20** — the owner said yes; the sub-category was created and all 8 rows loaded. See §9. |
| **سپری / سیم‌جوش آلومینیوم، 7 استنلس fitting lines** | 8 sub-categories still empty. Genuinely no published table anywhere — needs a supplier, not another scrape. Unchanged from the previous pass. |
| **لوله مانیسمان خارجی** | Still empty. 42 real imported rows exist, all per-شاخه; converting them needs an ASME B36.10M weight per (size, رده) and doing that arithmetic gives an implied per-kg spanning 175,369 → 299,529 across neighbouring sizes of the same schedule. Unchanged. **The new `price_basis` column now makes a per-شاخه load possible without any conversion at all** — that is a real option the previous pass did not have. |
| **بوشن مسی / میلگرد مسی** | Still empty; ahanonline publishes no priced rows. |
| **نبشی ۱۲'s mill** | Its stored price matches آونگان's rows while its stored mill says ناب تبریز, which publishes no 120×120. Same shape as §2; left alone rather than folded in. |
| **`track/TrackLookup` renders `kg` as «تن»** | Noticed while consolidating the unit labels. It prints «۵۰۰ تن» for a 500 kg order line. Left exactly as found — changing what a shipment card says about quantity is a separate question from adding a unit. |

---

## 8. Verification

### Quality gates

- `tsc --noEmit` clean.
- `next lint` — no errors and no new warnings on any touched file.
- Full `next build` (production, in Docker) green.
- Targeted suites run on this host: 378 tests across `lib/utils/`, `components/catalog/`,
  `components/cart/`, `components/admin/` and `leads.pricing` — all green. The full suite was
  **not** run here on purpose (16 GB shared with 11 live containers; a prior full run OOM'd the
  box). GitHub Actions is the source of truth: `CI / checks` and `CI / e2e` both **passed** on
  PR [#205](https://github.com/Am1eza/Iron/pull/205).
- `Workers Builds: ahantime` fails — it also fails on the already-merged #203 and #204, i.e.
  pre-existing red on the secondary Cloudflare target, not caused by this change.
- **`main` is fully green** on `CI / checks` and `CI / e2e` at `60f643e`, the final commit.
- Two flakes along the way, named rather than hidden — both re-ran green on `main` and both are
  in code this pass does not touch:
  - `CI / checks` once failed on `src/lib/auth/service.test.ts > rotates the refresh token`, a
    wall-clock grace-window assertion. It passed on the PR run with the identical tree and passes
    in isolation here.
  - `CI / e2e` once failed on two `admin-pricing-catalog` specs with a generic drizzle
    `Failed query` — and the *same* run also failed an unrelated `select count(*) from users`
    query, which is the tell: the e2e Postgres is an in-process pglite served over a local
    socket, and the socket dropped. Not a missing column («column … does not exist» appears
    nowhere in the log), and the identical tree passed e2e on PRs #205, #206 and #207 and on
    `main@4fc302d`.

### The four scripts — all dry-run, reviewed, applied, re-queried, and idempotent

| script | changed | re-run reports |
|---|---:|---|
| `scripts/setPriceBasis.ts` | 149 SKUs | 0 to change |
| `scripts/seedSandwichPanel.ts` | 6 created | 0 to create |
| `scripts/fixHashMills.ts` | 11 SKUs | 0 to change |
| `scripts/seedAluminium.ts` | 2 sub-categories + 108 SKUs | 0 to create |

Each aborts rather than guessing: `setPriceBasis` refuses a sub-category it has no evidence for,
`seedSandwichPanel` refuses a source row whose «واحد» is not متر مربع, `fixHashMills` refuses a
SKU whose stored mill is neither the researched one nor the target (i.e. someone already changed
it) and asserts its band, `seedAluminium` asserts its band, its date and slug uniqueness.

### Live database, after

```
 active_skus | inactive | with_price | publishable | active_subs | empty_active_subs | price_points
-------------+----------+------------+-------------+-------------+-------------------+--------------
        1050 |       88 |       1043 |         963 |          79 |                12 |        22853
```

### Deployed and re-verified live

`main@39cab1a` → `ghcr.io/am1eza/iron-web:39cab1a154bc2f95e57afb1a58d41eaf551360eb`, running in
`ahantime-web-1` (healthy). The deployed image hash matches `origin/main` exactly. (The code
itself shipped one commit earlier as `4fc302d`; `39cab1a` is this report, a root-level markdown
file with no effect on the bundle, redeployed only so the running hash matches `main`.)

```
200  https://ahantime.com/                 (public)
307  https://panel.ahantime.com/           (→ login)
404  https://ahantime.com/admin            (hidden on the public host)
```

Migration `0042` was applied to the live database before the container was swapped; it is purely
additive (three NOT NULL columns with a `'kg'` default plus one nullable double), so the running
old image was unaffected during the window.

### Files

- `web/scripts/setPriceBasis.ts` · `seedSandwichPanel.ts` · `fixHashMills.ts` ·
  `seedAluminium.ts` — all dry-run by default, `--apply` to write.
- `web/src/lib/utils/priceMath.ts` — the one place a stored price becomes money.
- `web/drizzle/0042_price_basis.sql` + snapshot.
- `.claude/audits/catalog-owner-decisions-2026-08-20/` — every page fetched for this pass
  (ahanonline هاش / تسمه / نبشی / وال پست / لوله مسی / ساندویچ‌پانل، مرکزآهن آلومینیوم / هاش /
  تسمه، kilooton HEA/HEB), their parsers, and the two extracted JSON datasets.

### Out of scope, untouched as instructed

The products/Navbar mega-menu redesign, and the FAQ / article / comments-under-factory-page work.

---

## 9. Follow-up 2026-08-20 — ناودانی آلومینیوم loaded

§4 found this line live and priced and reported it rather than loading it, because فلزات رنگی had
no ناودانی sub-category at all and creating a product line was outside that pass's brief. The
owner approved it. This is that one item and nothing else.

### Re-fetched, not remembered

`markazeahan.com/product-category/aluminum/` was pulled again at **2026-08-20 08:20 UTC** and
re-parsed. What §4 recorded holds on today's page:

| | |
|---|---|
| table | «ناودانی آلومینیوم», dated **۱۴۰۵/۰۵/۲۸** |
| rows | **8**, every one priced |
| قیمت | **630,000 تومان/کیلوگرم** — identical across all 8 |
| کارخانه | **آلومین گستر** |
| طول | **6 m** |
| واحد | **کیلوگرم** |

The script re-derives all of that from the fetched JSON rather than taking it on trust: it drops
any row whose table is not dated ۱۴۰۵/۰۵/۲۸, aborts unless every row's «واحد» reads کیلوگرم, and
asserts every price inside 400,000–1,200,000 T/kg before it opens a transaction.

### The 8 SKUs

New sub-category `felezat-rangi` / **`aluminum-channel`** — «ناودانی آلومینیوم», order 13.

```
felezat-rangi-aluminum-channel-10x10   ناودانی آلومینیوم ۱۰×۱۰
felezat-rangi-aluminum-channel-13x10   ناودانی آلومینیوم ۱۳×۱۰
felezat-rangi-aluminum-channel-16x16   ناودانی آلومینیوم ۱۶×۱۶
felezat-rangi-aluminum-channel-20x16   ناودانی آلومینیوم ۲۰×۱۶
felezat-rangi-aluminum-channel-20x20   ناودانی آلومینیوم ۲۰×۲۰
felezat-rangi-aluminum-channel-20x30   ناودانی آلومینیوم ۲۰×۳۰
felezat-rangi-aluminum-channel-20x40   ناودانی آلومینیوم ۲۰×۴۰
felezat-rangi-aluminum-channel-20x50   ناودانی آلومینیوم ۲۰×۵۰
```

All: `unit = 'kg'`, `price_basis = 'kg'`, `branch_length_m = 6`, `factory = 'آلومین گستر'`,
`theoretical_weight_kg = NULL`, price 630,000, تحویل ۲۴ ساعت, VAT not included — plus one
`price_points` row each, so the line has a history from day one.

### One thing the source is inconsistent about

مرکزآهن states each size twice and in **opposite orders**: the product name reads «ناودانی 20*40
آلومینیوم» where the «سایز» column reads «40*20». That is true of all 8 rows, so neither column is
reliably larger-first and picking by "which looks like the conventional spec" would be a guess.

The size is taken from the **product name** — that is the string a buyer sees and searches on the
source, and it is what `seedAluminium.ts` already parses for نبشی. The «سایز» column is then used
as an assertion: the script aborts if the two ever stop being exact reversals of each other, since
at that point they would mean different things and a human has to say which one names the product.

### No theoretical weight — deliberately, again

The «وزن هر شاخه» column still contradicts itself on today's fetch: **ناودانی ۱۳×۱۰ is listed at
8 kg** against 0.6–1.5 kg for all seven of its siblings. So the column is not used for any row,
which is the same refusal §4 made for the other 108 aluminium SKUs and the standing rule that a
weight is written only when the section table and the branch length are *both* trustworthy.
`branch_length_m = 6` **is** written, because the table states it plainly.

The consequence is the intended one: these 8 rows quote per kilogram and cannot silently
auto-quote a شاخه.

> The **هاش theoretical-weight fill** — the other §7 loose end — was explicitly out of scope here
> and is untouched. It changes what auto-quotes to a customer without human review, which is the
> owner's call to make directly.

### Verified live

Re-queried from the database itself, not from the script's own output — 8 SKUs, 8 `current_prices`
rows, 8 `price_points`, all `kg`/`kg`, all weights null, all lengths 6.

Through Caddy on the public origin:

```
200  /prices/felezat-rangi/aluminum-channel                        8 rows, «تومان / کیلوگرم»
200  /prices/felezat-rangi/aluminum-channel/…-20x40                the SKU page
200  /prices/felezat-rangi                                         chip list now ends «… ناودانی آلومینیوم»
```

The category page went **۱۸۰ → ۱۸۸ کالا** and **۷ → ۸ کارخانه** (آلومین گستر is the new one) once
its 300-second ISR window turned over.

`tsc --noEmit` clean, `next lint` clean, Prettier clean, and the 44 catalog tests
(`catalogCompose`, `catalogLabels`) pass. No migration, no schema change, no code path touched —
`felezat-rangi` sub-categories are entirely DB-driven, which is why §4's `aluminum-sheet` and
`aluminum-profile` needed no code either.

### Noticed, not fixed

`/prices/felezat-rangi/<sub>/<sku>` renders the breadcrumb's category as the raw slug
**`felezat-rangi`** instead of «فلزات رنگی». Pre-existing — the same on the نبشی آلومینیوم SKU
pages from §4 — and unrelated to this change, so it is reported rather than folded in.

### Files

- `web/scripts/seedAluminiumChannel.ts` — dry-run by default, `--apply` to write, idempotent.
- `.claude/audits/aluminium-channel-2026-08-20/` — the page as fetched today, the parser, the
  extracted 8-row JSON, and the rendered pages checked against it.

---

<a id="audit-catalog-c"></a>

## Source: `audit-catalog-C.md`

# آدیت سخت‌گیرانهٔ بخش C — کاتالوگ، کشف محصول و صحت داده

تاریخ: ۱۴۰۵/۰۶/۱۳ (۲۰۲۶-۰۹-۰۴) · دامنه: taxonomy، صفحات قیمت، SKU، جست‌وجو، related، علاقه‌مندی، cross-list، قیمت بدون عدد و SEO.

روش: بازبینی queryها و مسیرهای عمومی، تطبیق کامنت‌ها با شرط‌های واقعی SQL، و بررسی تست‌های موجود. مرورگر در محیط در دسترس نبود؛ بنابراین شواهد این مرحله کدمحور است.

## C-01 — نشت محصول/دستهٔ غیرفعال در خواندن‌های عمومی

- **وضعیت فعلی:** جدول قیمت بعضی مسیرها شرط فعال دارد، اما چند query عمومی آن را ندارد.
- **مشکل دقیق:** `findSkuRow`، `findSkuRowsByIds`، `relatedSkuRows` و `headlineRowPerCategory` هیچ شرط `skus.isActive / categories.isActive / subCategories.isActive` ندارند. `tableRows` نیز شرط صریح فعال‌بودن ندارد.
- **شدت مشکل:** Critical
- **دلیل اینکه چرا مشکل است:** محصول بازنشسته می‌تواند دوباره در API، صفحهٔ مستقیم، علاقه‌مندی، جست‌وجوی غیرمستقیم یا کارت related ظاهر شود؛ این یکپارچگی catalog را می‌شکند.
- **تأثیر روی Revenue / Conversion / SEO / UX:** Revenue و Conversion بالا؛ SEO بالا (صفحه‌های قدیمی قابل‌خزش)؛ UX و اعتماد بسیار بد.
- **شواهد:** `web/src/lib/server/repos/catalogRepo.ts:291-326,341-370,557-631`؛ کامنت‌های W24 ادعا می‌کنند فیلتر هست، ولی `.where(and(...))` شرط active ندارد.
- **راه‌حل پیشنهادی:** یک predicate مرکزی `publicCatalogScope()` بسازید و همهٔ readهای عمومی، API SKU، search، favorites، related، sitemap و JSON-LD را از آن عبور دهید.
- **اولویت اجرا:** P0
- **میزان سختی اجرا:** متوسط
- **تخمین Impact:** بسیار بالا؛ جلوگیری از نمایش کالای بازنشسته و سفارش اشتباه.
- **مثال سایت‌های برتر:** کاتالوگ‌های B2B فقط offer و taxonomy فعال را publish می‌کنند.
- **Acceptance Criteria:** SKU/category/sub غیرفعال در هیچ endpoint عمومی، HTML، sitemap یا related دیده نشود؛ تست منفی برای هر read اضافه شود.

## C-02 — فهرست دسته‌ها وضعیت فعال را فیلتر نمی‌کند

- **وضعیت فعلی:** `listCategories()` همهٔ دسته‌ها را برمی‌گرداند.
- **مشکل دقیق:** query فقط `orderBy` دارد و `where(isActive=true)` ندارد.
- **شدت مشکل:** High
- **دلیل:** دسته‌ای که ادمین بازنشسته کرده می‌تواند در nav، breadcrumb، hub و مسیرهای تولید URL باقی بماند.
- **تأثیر:** Revenue/Conversion متوسط؛ SEO بالا به‌علت URLهای بی‌محتوا؛ UX بالا.
- **شواهد:** `catalogRepo.ts:110-128` و مصرف `getCategories()` در صفحات قیمت.
- **راه‌حل:** فیلتر فعال در repository و تست دستهٔ inactive.
- **اولویت:** P0 | **سختی:** کم | **Impact:** بالا
- **مثال:** taxonomy عمومی Shopify/Adobe فقط nodeهای publish‌شده را می‌خواند.
- **Acceptance Criteria:** دستهٔ inactive در nav، hub، sitemap و metadata صفر حضور داشته باشد.

## C-03 — sub-category غیرفعال در nav و breadcrumb

- **وضعیت فعلی:** `listAllSubCategories` و `listSubCategories` join دارند ولی شرط فعال ندارند.
- **مشکل دقیق:** کامنت می‌گوید «Every ACTIVE sub-category»، اما SQL همهٔ subها را برمی‌گرداند.
- **شدت:** High
- **دلیل:** کاربر به فیلتر/صفحه‌ای می‌رود که نباید منتشر باشد و taxonomy با دادهٔ عملیاتی اختلاف پیدا می‌کند.
- **تأثیر:** Conversion و UX بالا؛ SEO متوسط تا بالا؛ Revenue متوسط.
- **شواهد:** `catalogRepo.ts:187-230`.
- **راه‌حل:** شرط فعال برای category و sub در هر دو query و cross-list.
- **اولویت:** P0 | **سختی:** کم | **Impact:** بالا
- **مثال:** منوی کاتالوگ‌های بزرگ فقط دستهٔ publishable را نشان می‌دهد.
- **Acceptance Criteria:** sub غیرفعال در map، منو، breadcrumb، static params و sitemap نباشد.

## C-04 — جست‌وجو محصول بازنشسته را برمی‌گرداند

- **وضعیت فعلی:** جست‌وجو فقط شرط‌های تطبیق متن را به `.where(and(...conds))` می‌دهد.
- **مشکل دقیق:** `skus/categories/subCategories.isActive` در query search وجود ندارد.
- **شدت:** Critical
- **دلیل:** کاربر با جست‌وجوی نام یک کالای بازنشسته هنوز نتیجه و احتمال اقدام می‌بیند؛ AI نیز همین seam را مصرف می‌کند.
- **تأثیر:** Revenue/Conversion بالا؛ SEO ندارد؛ UX و اعتماد بالا.
- **شواهد:** `catalogRepo.ts:807-850` و fallback همان تابع.
- **راه‌حل:** scope فعال مرکزی در هر دو exact و misspelling fallback؛ تست جست‌وجوی inactive.
- **اولویت:** P0 | **سختی:** کم | **Impact:** بسیار بالا
- **مثال:** search indexهای commerce رکوردهای unpublished را حذف یا فیلتر می‌کنند.
- **Acceptance Criteria:** هیچ variant جست‌وجو inactive را برنگرداند؛ نتیجهٔ صفر پیام درست بدهد.

## C-05 — صفحهٔ مستقیم SKU و API با slug غیرفعال

- **وضعیت فعلی:** `findSkuRow(slug)` فقط `eq(skus.slug, slug)` دارد.
- **مشکل دقیق:** صفحه/API مستقیم می‌تواند ۲۰۰ و دادهٔ SKU غیرفعال بدهد، حتی اگر sub page آن پنهان باشد.
- **شدت:** Critical
- **دلیل:** canonical/JSON-LD/خرید مستقیم از مسیر قدیمی ممکن می‌شود.
- **تأثیر:** SEO و Revenue بالا؛ Conversion و UX بالا.
- **شواهد:** `catalogRepo.ts:557-581` و `app/api/sku/[slug]/route.ts`.
- **راه‌حل:** فعال‌بودن هر سه سطح و قیمت قابل‌انتشار در public DTO؛ inactive → 404/410 طبق سیاست.
- **اولویت:** P0 | **سختی:** کم | **Impact:** بسیار بالا
- **مثال:** صفحات product غیرفعال در commerce حرفه‌ای 404/410 یا redirect معتبر دارند.
- **Acceptance Criteria:** slug inactive در HTML/API/JSON-LD status مناسب بدهد و در sitemap نباشد.

## C-06 — related و علاقه‌مندی کالای بازنشسته را زنده نشان می‌دهند

- **وضعیت فعلی:** `relatedSkuRows` و `findSkuRowsByIds` فقط id/category را محدود می‌کنند.
- **مشکل دقیق:** inactive relation یا favorite از UI پاک/فیلتر نمی‌شود.
- **شدت:** High
- **دلیل:** مسیرهای اعتمادساز باید دقیق‌تر از search باشند؛ اینجا کالای مرده دوباره پیشنهاد می‌شود.
- **تأثیر:** Conversion و UX بالا؛ Revenue متوسط؛ SEO کم.
- **شواهد:** `catalogRepo.ts:587-631` و `favoritesRepo.ts`.
- **راه‌حل:** scope فعال؛ favorite غیرفعال به‌صورت شفاف archived/removed شود، نه کارت قابل‌اقدام.
- **اولویت:** P0 | **سختی:** کم | **Impact:** بالا
- **مثال:** wishlistهای بزرگ وضعیت unavailable را explicit می‌کنند.
- **Acceptance Criteria:** related/favorite inactive قابل‌افزودن به سبد نباشد و پیام روشن داشته باشد.

## C-07 — headline دسته از رکورد نامناسب انتخاب می‌شود

- **وضعیت فعلی:** `headlineRowPerCategory` یک ردیف را با `DISTINCT ON` انتخاب می‌کند، اما where خالی است.
- **مشکل دقیق:** حتی category/SKU/sub غیرفعال یا بدون قیمت می‌تواند نمایندهٔ hub شود.
- **شدت:** High
- **دلیل:** یک کارت اشتباه در صفحهٔ اصلی برداشت اولیهٔ کل برند از آن دسته است.
- **تأثیر:** Conversion و UX بالا؛ SEO و Revenue متوسط.
- **شواهد:** `catalogRepo.ts:341-370`، بخش `where(and())` خالی.
- **راه‌حل:** فقط active + publishable، و انتخاب deterministic بر اساس تازه‌ترین قیمت معتبر.
- **اولویت:** P0 | **سختی:** کم | **Impact:** بالا
- **مثال:** category heroها از offer فعال و موجود استفاده می‌کنند.
- **Acceptance Criteria:** headline هرگز inactive/empty-price نامناسب نباشد؛ نبود مورد معتبر، کارت تماس شفاف بدهد.

## C-08 — cross-list می‌تواند taxonomy متناقض بسازد

- **وضعیت فعلی:** دستهٔ مقصد از JSONB cross-list خوانده می‌شود، اما اعتبار category/sub/SKU و duplicate slug به‌صورت مرکزی تضمین نشده است.
- **مشکل دقیق:** یک SKU می‌تواند در hub مقصد دیده شود ولی breadcrumb/URL آن به خانهٔ دیگری اشاره کند؛ subهای تکراری نیز ادغام دستی می‌شوند.
- **شدت:** High
- **دلیل:** کاربر نمی‌فهمد محصول واقعاً متعلق به کدام دسته است و SEO سیگنال‌های متناقض می‌گیرد.
- **تأثیر:** SEO و UX بالا؛ Conversion متوسط؛ Revenue متوسط.
- **شواهد:** `crossListedSubsByCategory` و `tableRows` در `catalogRepo.ts:148-218,291-326`.
- **راه‌حل:** قرارداد canonical category، اعتبارسنجی مقصد فعال، slug یکتا در scope و تست cross-list.
- **اولویت:** P1 | **سختی:** زیاد | **Impact:** بالا
- **مثال:** marketplaceها canonical offer و taxonomy source را جدا و صریح نگه می‌دارند.
- **Acceptance Criteria:** هر URL یک canonical owner داشته باشد؛ cross-list فقط discovery باشد، نه دو صفحهٔ canonical رقیب.

## C-09 — کالای بدون قیمت با کالای قابل‌خرید هم‌سطح دیده می‌شود

- **وضعیت فعلی:** ردیف بدون `current_prices` در جدول می‌آید و متن تماس می‌گیرد.
- **مشکل دقیق:** مدل `PriceRow` نبود قیمت و قیمت کهنهٔ پنهان را هر دو به عدد صفر/تماس تبدیل می‌کند و تفاوت عملیاتی واضحی در UI عمومی ندارد.
- **شدت:** Medium
- **دلیل:** کاربر نمی‌داند کالا واقعاً عرضه می‌شود یا فقط داده ناقص است؛ lead کم‌کیفیت می‌سازد.
- **تأثیر:** Conversion و UX متوسط؛ Revenue متوسط؛ SEO کم.
- **شواهد:** `catalogRepo.ts:74-90, toPriceRow` و `listActiveSkuIdsWithoutPrice`.
- **راه‌حل:** badge و state جداگانهٔ «بدون نرخ»/«نرخ منقضی»، CTA متناسب و صف ادمین با count.
- **اولویت:** P1 | **سختی:** متوسط | **Impact:** متوسط تا بالا
- **مثال:** B2B catalogها availability و price missing را جدا نشان می‌دهند.
- **Acceptance Criteria:** API state machine مشخص داشته باشد؛ کاربر پیام و اقدام مناسب هر حالت را ببیند.

## C-10 — قیمت کهنه، کاتالوگ را از ارزش اصلی خالی می‌کند

- **وضعیت فعلی:** freshness به‌درستی عدد کهنه را پنهان می‌کند، اما در صورت فراگیری staleness تقریباً همهٔ صفحات به «تماس بگیرید» تبدیل می‌شوند.
- **مشکل دقیق:** fail-safe مالی است، اما fallback تجاری/صف مدیریت بحران برای جلوگیری از کاتالوگ بی‌قیمت و اندازه‌گیری SLA کافی نیست.
- **شدت:** High
- **دلیل:** حفاظت از اعتماد بدون مسیر بازگرداندن قیمت، Conversion و SEO کاتالوگ را عملاً صفر می‌کند.
- **تأثیر:** Revenue و Conversion بسیار بالا؛ SEO متوسط؛ UX متوسط.
- **شواهد:** `getPriceFreshness`، `toPriceRow` و گزارش‌های `AUDIT-CLOSEOUT.md`/`CATALOG_GAP_FIX_REPORT.md` دربارهٔ نرخ‌های stale/unpriced.
- **راه‌حل:** freshness dashboard با SLA، alert قبل از صفرشدن پوشش، نمایش تاریخ آخرین نرخ و مسیر bulk import تأییدشده.
- **اولویت:** P0/P1 | **سختی:** متوسط تا زیاد | **Impact:** بسیار بالا
- **مثال:** price feeds حرفه‌ای پوشش و last-success را به‌عنوان SLO پایش می‌کنند.
- **Acceptance Criteria:** پوشش fresh به تفکیک دسته alert داشته باشد؛ افت زیر آستانه owner و SMS بگیرد؛ نرخ اشتباه هرگز نمایش داده نشود.

## C-11 — اختلاف mock و live می‌تواند تست/پیش‌نمایش را فریب دهد

- **وضعیت فعلی:** mock برای نبود DB برمی‌گردد و مسیرهای prerender با fixture taxonomy گیت شده‌اند.
- **مشکل دقیق:** UI/SEO در mock ممکن است سالم به‌نظر برسد ولی live taxonomy، قیمت و تعداد متفاوت باشد.
- **شدت:** Medium
- **دلیل:** تیم بر اساس preview تصمیم می‌گیرد درحالی‌که دادهٔ واقعی ممکن است صفحه را خالی یا محصول را حذف کند.
- **تأثیر:** UX و Conversion متوسط؛ SEO متوسط؛ Revenue متوسط.
- **شواهد:** `server/catalog.ts` fallback mock و `generateStaticParams` در صفحات قیمت.
- **راه‌حل:** contract fixture، smoke test live-like با snapshot taxonomy و ممنوعیت ادعای «قیمت موجود» در mock.
- **اولویت:** P1 | **سختی:** متوسط | **Impact:** متوسط
- **مثال:** محیط staging از snapshot scrubbed production با schema یکسان استفاده می‌کند.
- **Acceptance Criteria:** تفاوت تعداد/slug/price state در CI گزارش شود؛ mock نتواند نبود دادهٔ live را پنهان کند.

## جمع‌بندی امتیاز فعلی

| محور | امتیاز |
|---|---:|
| صحت و یکپارچگی taxonomy | ۸/۲۰ |
| کشف و جست‌وجوی محصول | ۱۰/۲۰ |
| صحت صفحه/API/SEO | ۹/۲۰ |
| قیمت/availability و conversion | ۱۲/۲۰ |
| تست، پایش و مقیاس‌پذیری | ۱۲/۲۰ |
| **جمع فعلی** | **۵۱/۱۰۰** |

این نمره قبل از اصلاح است. تا C-01، C-04، C-05 و C-07 بسته نشوند، هیچ مسیر عمومی کاتالوگ را نمی‌توان سالم تلقی کرد—even اگر ظاهر جدول خوب باشد.
