# اصلاح قیمت‌ها و پر کردن زیردسته‌های تازه‌فعال — گزارش اجرا

**Price fix + new-sub-category fill, from ahanonline data — WRITES APPLIED**

- Run: 2026-08-19, on the live database (`ahantime-db-1`), authorised by Amir.
- Source: the 2026-08-19 comparison pass's saved scrape
  (`.claude/audits/ahanonline-price-comparison-2026-08-19/`) for Part A, plus a
  fresh, rate-limited fetch of 54 ahanonline `/product-category/*` pages for the
  sub-categories that pass never covered. `robots.txt` re-read at the start of
  this run; `/PriceList/*` and `*price-list*` remain `Disallow`ed and were not
  touched; ~1 request / 3.5 s, real browser UA.
- **This run DID write.** 543 `current_prices` rows, 543 `price_points` rows,
  260 new `skus` rows, 5 `skus.theoretical_weight_kg` corrections.
- **Nothing was deleted or deactivated.** Every SKU that existed before this run
  still exists and is still `is_active = true`.

---

## 0. Headline

| | before | after |
|---|---:|---:|
| Active SKUs | 426 | **686** |
| …with a `current_prices` row | 206 | **679** |
| …with a price fresh enough to PUBLISH (`PRICE_STALE_HIDE_AFTER_DAYS = 2`) | **0** | **543** |
| `price_points` rows | 21,871 | 22,414 |
| Sub-categories live with zero products | 35 | **14** |

The "publishable" line is the one that matters. Before this run every single
price on the site was 43 days old, and `catalogRepo.toPriceRow` withholds a price
older than 2 days — so **all 426 active SKUs were rendering «تماس بگیرید»**, not a
wrong number. That is why the bar for writing here was "the number is sourced",
not "the number is better than what's there": a write turns a hidden price into a
published one.

Per category, after:

| دسته | active | با ردیف قیمت | قابل انتشار |
|---|---:|---:|---:|
| میلگرد | 246 | 245 | 245 |
| ورق | 80 | 80 | 47 |
| فلزات رنگی | 72 | 72 | 72 |
| لوله | 59 | 59 | 26 |
| استیل | 55 | 55 | 55 |
| تیرآهن | 46 | 40 | 19 |
| پروفیل و قوطی | 46 | 46 | 34 |
| کلاف و مفتول | 42 | 42 | 23 |
| نبشی و ناودانی | 40 | 40 | 22 |

The gap between «با ردیف قیمت» and «قابل انتشار» is the 173 pre-existing rows
from 2026-07-07 that this run deliberately did **not** overwrite — every one of
them is listed with its reason in §4 and in
`unpriced-flagged-2026-08-19.csv`.

---

## 1. Part A — prices written on existing SKUs (283 rows)

Field conventions used on every row, matching what is already in the table:

| field | value | why |
|---|---|---|
| `unit` | the SKU's own `skus.unit` | never the category default; 0 mismatches, asserted before the write |
| `vat_included` | `false` | ahanonline serves ex-VAT (its «احتساب ارزش افزوده» toggle is off in the served HTML), and all 243 pre-existing rows are `false` |
| `is_stale` | `false` | |
| `updated_at` | `now()` | |
| `movement_pct` / `movement_dir` | `NULL` / `flat` | this is a re-baseline after a 43-day gap, not a day-over-day move; publishing "+180%" as نوسان would be a lie |
| `delivery_time` | preserved where a row existed, `'۲۴ ساعت'` (the column default) for new rows | there is no per-category convention in the existing data — it is 4 values sprinkled evenly across every category |
| `updated_by` | `NULL` | 242 of the 243 pre-existing rows are `NULL`; the FK is `on delete set null`; no signed-in admin performed this pass, so inventing a user id would be false attribution |

Every `current_prices` write has a matching `price_points` row at the same
instant — 543 of each.

### 1a. How each price was decided

Four tiers. The full per-row detail (source page, source product name, source
product code, old price, new price) is in **`prices-written-2026-08-19.csv`**.

| tier | n | rule |
|---|---:|---|
| **T1** | 201 | `exact`/`fuzzy` match in the comparison set, our unit kg, ahanonline quotes per kg → taken directly |
| **T2** | 19 | تیرآهن, our unit `branch` → ahanonline's own **per-شاخه, 12 m, بنگاه تهران** row for the same size + mill. No conversion, no assumed weight |
| **T2b** | 1 | the single branch-priced میلگرد → per-kg price × the branch weight the site's own `d²/162 × 12 m` formula gives |
| **T3** | 62 | `uncertain` match (size matched on the right page, mill differs or the page publishes no mill) → accepted **only** where ahanonline's own cross-mill spread for that exact size on that page is ≤ 15 %, i.e. where the mill demonstrably does not move the price. Written value is the median across those rows |

T3 is the only judgement call, so it is stated mechanically rather than by feel.
Example: ahanonline's whole پروفیل page runs 104,545–108,181 T/kg across اصفهان،
تهران and مازندران — a 3.5 % band — so «قوطی مربع ۴۰×۴۰ فولاد مشهد» getting the
105,454 median is a market reference with a measured error bar, not a guess.
Where the spread was wide the rule refused: لوله گالوانیزه ۳ اینچ (ساوه vs قزوین,
22 % apart) and ورق سیاه ۱۰ (31 % apart) were both left alone.

By category / sub-category:

| دسته | زیردسته | n |
|---|---|---:|
| میلگرد | میلگرد آجدار | 193 |
| تیرآهن | تیرآهن | 19 |
| پروفیل و قوطی | درب و پنجره / قوطی مربع / پروفیل ستونی / قوطی مستطیل / پروفیل گالوانیزه / پروفیل مبلی | 6 / 6 / 6 / 5 / 4 / 1 |
| ورق | آلیاژی / روغنی / سیاه / گالوانیزه / آجدار / عرشه فولادی | 6 / 3 / 3 / 2 / 1 / 1 |
| نبشی و ناودانی | ناودانی سنگین / ناودانی سبک / نبشی | 6 / 4 / 4 |
| کلاف و مفتول | توری / سیم آرماتوربندی / کلاف آجدار / کلاف ساده | 2 / 2 / 2 / 2 |
| لوله | صنعتی درزدار / گالوانیزه / داربستی | 2 / 2 / 1 |

**میلگرد is the headline: 193 of 194 active میلگرد SKUs now publish a price**
(190 exact + 3 category-reference), where before this run the biggest category on
the site published none at all. The one exception is «میلگرد آجدار ۱۲ آناهیتا
گیلان» — see §4.

### 1b. Five product-line refusals applied before any tier ran

A matching size does not mean a matching product. These five were hand-checked
against the raw rows and hard-coded as refusals (`plan_a.py :: product_line_refusal`):

1. **هاش** — the whole page. See §2.
2. **نبشی لقمه** (5 SKUs) — matched against plain نبشی rows. A لقمه is a spacer,
   not an angle. One of these was even labelled `exact`.
3. **پروفیل Z ۲۰×۲۰** — ahanonline specifies Z profile by height (Z16–Z22); our
   size is a box dimension, so the digit match was coincidental.
4. **لوله گازی ۳/۴/۵/۶ اینچ** (4 SKUs) — matched rows were «تست آب» / «صنعتی» on
   the لوله درز مستقیم page, not gas pipe. Their actual gas rows (تست گاز /
   تست گاز خانگی) are per-kg only up to 2½ اینچ; at our sizes they are per-شاخه.
5. **کلاف آجدار ۱۰** and one sibling — matched against the straight-bar
   قیمت-میلگرد page. A coil is priced on its own page.

---

## 2. هاش — decision: NOT priced, and why

**Outcome: all 12 هاش SKUs (6 HEA + 6 HEB) were left without a published price.**

The prior report warned that ahanonline's هاش numbers are for imported stock. I
re-fetched the هاش page live to check that, and the picture is more specific than
"imported vs domestic" — and worse for using it:

- The برند column on that page is **not** uniformly foreign. It reads «ذوب آهن»
  on HEA 14/16/18/20 and HEB 14/16/18/20/30, and «ذوب آهن اصفهان» on HEB
  14/22/24/26 — an Iranian mill. Taken at face value, a domestic-mill هاش price
  *is* published there.
- But every row on the page, foreign and domestic alike, sits in one narrow
  163,636–227,272 T/kg band. The برند column moves the price by nothing at all.
- One row — «هاش سنگین 14 ذوب آهن اصفهان 12 متری» — carries **واحد = شاخه** at
  200,000 تومان. A 12 m HEB-140 branch weighs ~400 kg; 200,000 T for the whole
  branch is impossible. That cell is mislabelled.
- The band is ~2.2× ahanonline's own تیرآهن (79,000–106,000 T/kg on the same
  site, same date). A 2.2× premium is what imported هاش commands over domestic
  تیرآهن; domestic هاش does not trade at that multiple.

Read together: that page's brand and unit columns are not being maintained, so
**no domestic-mill هاش price can be read off it**, including from the rows that
happen to say «ذوب آهن». Copying 200,000 onto «هاش سبک (HEA) ۲۰ ذوب‌آهن اصفهان»
would have been ~2× wrong on a live commercial page.

I looked for an alternative reference the way the شمش فولاد billet price is
handled (`marketRepo` — admin-entered, no feed, because no defensible public
feed exists) and found none: there is no other source already trusted by this
codebase, and inventing one from a third-party site would be exactly the
fabrication the task told me to avoid.

There is a second, separate problem underneath the price one, which is Amir's to
decide, not mine:

| SKU | our mill | is this mill a هاش producer? |
|---|---|---|
| هاش سبک (HEA) ۱۴, ۱۸ | فایکو | فایکو rolls تیرآهن and میلگرد; no هاش listing anywhere on ahanonline |
| هاش سبک (HEA) ۱۶, ۲۴ | آریان فولاد | same |
| هاش سبک (HEA) ۲۲ · هاش سنگین (HEB) ۱۸, ۲۴ | یزد احرامیان | same |
| هاش سنگین (HEB) ۱۶, ۲۰, ۲۲ | جهان فولاد غرب | same |
| هاش سبک (HEA) ۲۰ | ذوب‌آهن اصفهان | the only one with a same-mill row on ahanonline (200,000 T/kg — the unreliable figure above) |
| هاش سنگین (HEB) ۲۷ | ماهان سپاهان | size ۲۷ is not listed at all in HEB on ahanonline |

**Recommendation:** هاش prices go in by hand. If Amir wants them from a
reference, ahanonline's own domestic-branded rows are 195,454–209,090 T/kg for
HEA/HEB 14–26 — but he should confirm that against a mill or a broker before it
goes live, because the evidence above says that table cannot be trusted on its
own. And separately: the mill attributions on 11 of these 12 SKUs look wrong and
should be corrected or the SKUs retired.

---

## 3. `theoretical_weight_kg` — corrections applied, and a much bigger finding

### 3a. Applied (5 rows, logged old → new)

Only the rows where the شاخه↔kg bridge was actually needed were changed:

| SKU | old | new | basis |
|---|---:|---:|---|
| لوله مانیسمان ۳ اینچ | 0.7 | **67.7** | ASME B36.10M sch40 seamless, 6 m branch (11.29 kg/m × 6) |
| لوله مانیسمان ۴ اینچ | 1.2 | **96.4** | 16.07 kg/m × 6 |
| لوله مانیسمان ۵ اینچ | 1.9 | **130.6** | 21.77 kg/m × 6 |
| لوله مانیسمان ۶ اینچ | 2.7 | **169.6** | 28.26 kg/m × 6 |
| لوله مانیسمان ۸ اینچ | 4.7 | **255.3** | 42.55 kg/m × 6 |

sch40 is the schedule ahanonline quotes its domestic (اهواز) مانیسمان at, and
`DEFAULT_LENGTH_M.pipe` in `web/src/lib/utils/weight.ts` is already 6 m, so both
halves of the number come from something published rather than assumed.

### 3b. …and the derived per-kg price was then REFUSED

The task's own cross-check killed it. With the corrected weights, ahanonline's
اهواز per-شاخه prices imply:

| size | their شاخه price | ÷ corrected weight | implied T/kg |
|---|---:|---:|---:|
| ۱ اینچ | 4,839,545 | 15.0 | 322,636 |
| ۲ اینچ | 10,299,545 | 32.6 | 315,875 |
| ۳ اینچ | 11,472,272 | 67.7 | 169,458 |
| ۴ اینچ | 17,326,363 | 96.4 | 179,733 |
| ۵ اینچ | 34,745,454 | 130.6 | 266,043 |
| ۶ اینچ | 43,431,818 | 169.6 | 256,085 |

169k to 322k across neighbouring sizes of the same product from the same mill is
not a price curve, it is noise — the 5-inch row alone is 2× the 4-inch row for a
1.35× weight step. Per the instruction, that means something is still wrong, so
**the five لوله مانیسمان SKUs were not priced.** They keep their (now correct)
weights and no published price. Their mills (تهران شرق، لوله سپاهان، سپنتا) do
not appear on ahanonline's مانیسمان page either, which is a second reason.

### 3c. The systemic weight bug — 185 active SKUs, NOT fixed, flagged for decision

`work/weight_audit.py` (kept in `scripts/`) shows that **379 active SKUs carry a
`theoretical_weight_kg` equal to `d²/162 × 12`, the ROUND-BAR formula, applied to
whatever number their size string starts with.** For the 194 میلگرد rows that is
correct — it is the right formula for round bar. For the other **185 it is
nonsense**:

| دسته | زیردسته | n | example |
|---|---|---:|---|
| پروفیل و قوطی | (all 6 subs) | 34 | «۱۰۰×۱۰۰» → **740.7 kg** |
| ورق | (all 8 subs) | 39 | ورق روغنی ۱ (1 mm sheet) → 0.1 kg |
| نبشی و ناودانی | (all 5 subs) | 27 | ناودانی ۱۰ → 7.4 kg (a 6 m UNP100 is ~64 kg) |
| لوله | (all 7 subs) | 38 | لوله ۱ اینچ → 0.1 kg |
| تیرآهن | سبک / لانه‌زنبوری / هاش | 21 | HEA-14 → 14.5 kg (a 12 m HEA140 is ~296 kg) |
| کلاف و مفتول | (6 subs) | 15 | |

This is not cosmetic. `leads.service.ts` and `estimate.service.ts` both compute a
پیش‌فاکتور line total as `theoreticalWeightKg × qty`, and the public price table
renders it as «وزن شاخه». A customer quoting 10 branches of پروفیل ۱۰۰×۱۰۰ is
being told they weigh 7,407 kg.

**I did not fix these**, for one reason: the correct number needs a standard
branch LENGTH per product line (6 m vs 12 m vs custom) and, for boxes and
sheets, a wall thickness that our catalog does not store. Guessing 185 of those
would replace a visibly-absurd number with a plausibly-wrong one, which is worse.

What the repo already has to fix it properly, once Amir decides the lengths:
`IBEAM_KG_PER_M`, `CHANNEL_KG_PER_M` and `ANGLE_KG_PER_M` in
`web/src/lib/utils/weight.ts` are exact published tables (cross-checked against
مرکزآهن on 2026-08-09), which covers تیرآهن، ناودانی and نبشی outright — 48 of
the 185. The 260 SKUs created by this run were given `theoretical_weight_kg =
NULL` deliberately, which is the state the estimate service already handles
gracefully, rather than adding to the pile.

**The 25 تیرآهن branch-priced SKUs were checked and are CORRECT** — 125 / 155 /
190 / 226 / 270 / 320 / 370 / 440 / 510 kg for ذوب‌آهن 12→30 matches
`IBEAM_KG_PER_M × 12` to within 1.5 %, and independently matches ahanonline's own
per-kg کارخانه row divided into its per-شاخه تهران row to within 2 % on all nine
sizes. No change was needed and none was made.

---

## 4. Existing SKUs left unpriced — 143, all with a reason

Full list with reference prices: **`unpriced-flagged-2026-08-19.csv`**.

| n | why |
|---:|---|
| 87 | no ahanonline counterpart at all (the 2026-08-19 pass's `unmatched` set) |
| 12 | هاش — §2 |
| 12 | mill differs and only ONE ahanonline row exists at that size, so no cross-mill median is possible |
| 7 | ahanonline quotes per شاخه while our SKU is per kg, and the derived per-kg failed the sanity band (§3b) |
| 6 | تیرآهن sizes ahanonline publishes no 12 m شاخه row for: فایکو ۱۶/۲۰/۲۲/۲۴، اهواز ۱۶، ظفر بناب ۱۶ |
| 5 | mill differs AND the cross-mill spread is too wide to median (19–32 %) |
| 5 | نبشی لقمه — wrong product line |
| 4 | لوله گازی — wrong product line |
| 2 | کلاف — wrong product line |
| 1 | پروفیل Z — wrong dimension scheme |
| 2 | other |

The ones most worth Amir's ten minutes, because a reference price *does* exist
and only the mill attribution is blocking:

| SKU | our mill | ahanonline reference (T/kg) |
|---|---|---:|
| میلگرد آجدار ۱۲ آناهیتا گیلان | آناهیتا گیلان | 70,000 (spread 19 % — ذوب‌آهن ۱۲ is an outlier at 78,545) |
| ورق سیاه ۱۰ | تاراز | 100,000 (spread 31 %) |
| ورق سیاه ۱۲ | هفت‌الماس | 98,863 (spread 32 %) |
| لوله گالوانیزه ۳ اینچ | تهران شرق | 199,831 (ساوه) / 22 % spread vs قزوین |
| لوله گالوانیزه ۴ اینچ | لوله سمنان | 164,545 / 26 % spread |
| لوله گالوانیزه ۵ / ۸ اینچ | لوله‌سازی اهواز | 199,831 / 194,178 (ساوه، سپاهان) |
| مفتول گالوانیزه ۳ / ۴ | کویر کاشان، یزد احرامیان | 109,090 (their سیم-مفتول page publishes no brand) |
| مفتول سیاه ۴ | جهان فولاد سیرجان | 109,090 |
| سپری ۵ / ۶ | جاوید بناب، سپهر ایرانیان | 81,015 (نورد سجاد) |
| تیرآهن سبک ۲۰/۲۲/۲۷ · لانه‌زنبوری ۲۰/۲۲/۲۴/۲۷ | various | 90,000–96,363 (ذوب آهن) — note these seven live in sub-categories that are `is_active = false`, so they do not render today |

---

## 5. SKUs that look physically impossible — for Amir's decision, NOT touched

The comparison pass flagged some of these; I re-checked each against ahanonline's
actual size ranges and added a few. **None of these was deactivated or deleted.**
They are all `is_active = true` and rendering today (except where the
sub-category itself is inactive, noted).

| SKU group | n | our sizes | the problem |
|---|---:|---|---|
| **ورق رنگی** | 7 | ۵، ۶، ۸، ۱۰، ۱۲، ۱۵، ۲۰ mm | colored/pre-painted sheet is 0.18–0.7 mm worldwide. ahanonline's ورق رنگی page carries nothing above 0.7. A 20 mm «ورق رنگی» is not a product |
| **لوله اسپیرال** | 7 | ½"–2½" | spiral-welded pipe starts at 16 inch. ahanonline's اسپیرال page starts at 16" |
| **پروفیل Z** | 7 | ۳۰×۳۰ … ۷۰×۷۰ | Z-purlin is specified by web height (Z16–Z22), never as a box dimension. Our sizes describe a different product |
| **ورق عرشه فولادی** | 6 | ۰.۷، ۱.۵، ۲، ۲.۵، ۳، ۴ mm | structural deck sheet is 0.8–1.25 mm; only our ۱ mm SKU is in range |
| **ورق اسیدشویی** | 5 | ۱۲–۳۰ mm | pickled sheet is 1.5–6 mm |
| **ورق آجدار** | 5 | ۰.۷–۲.۵ mm | checker plate is 3–10 mm |
| **لوله داربستی** | 5 | ½", ¾", ۱", ۱¼", ۲" | scaffold tube is 1½ inch, full stop. ahanonline lists that size only |
| **پروفیل مبلی** | 4 | ۷۰×۷۰ … ۱۰۰×۱۰۰ | furniture profile tops out at 60×60 / 80×40 |
| **لوله مبلی** | 4 | ۲½"–۵" | furniture pipe is dimensioned in mm (۱۴۰×۷۰ …), not inches |
| **مفتول گالوانیزه** | 4 | ۵.۵، ۶.۵، ۸، ۱۰ mm | galvanized wire is 2.2–4 mm |
| **سپری** | 3 | ۸، ۱۰، ۱۲ | سپری is rolled in 3–6 only |
| **کلاف ساده** | 2 | ۳، ۴ mm | کلاف starts at 5.5 mm |
| **سیم آرماتوربندی** | 2 | ۳، ۴ mm | tie wire is 1.5 / 2.5 mm |
| **نبشی بال نامساوی** | 5 | ۱۴–۲۲ | sub-category is `is_active = false`; ahanonline carries no unequal-leg angle at all |
| **نبشی لقمه** | 5 | ۱۰–۱۶ | sub-category is `is_active = false`; not a product line anywhere; its size match against plain نبشی is what triggered the refusal in §1b |
| **میلگرد آجدار ۱۴ ظفر بناب** | 1 | ۱۴ | the ONLY branch-unit SKU among 194 میلگرد, all the rest are kg. Priced correctly here (69,818 × 14.5 kg = 1,012,361 per شاخه) but the inconsistency looks like a data-entry slip |
| **هاش mill attributions** | 11 | — | §2 |

That is **~83 SKUs whose spec, not whose price, is the problem.** Fix-the-spec vs
deactivate is a product-catalog decision and it is Amir's.

---

## 6. Part B — 260 new SKUs across 21 of the 35 empty sub-categories

Full list: **`new-skus-2026-08-19.csv`**. All created `is_active = true` with a
price and a `price_points` row, so they publish immediately.

Naming and slugs use `composeSkuName` / `composeSkuSlug`, ported to Python and
**pinned**: `check_compose.py` re-derives the name and slug of all 219
composeSkuSlug-era SKUs already in the database and reproduces 219/219 slugs and
218/219 names (the one exception is a stored name that uses ASCII digits). Slugs
carry the sub-category segment (`wire-welding-wire-…`, `wire-wire-rod-…`) because
category-alone would have collided across the new lines, and vulgar fractions are
expanded (`steel-pipe-1-1-4-304`) rather than silently dropped.

| دسته | زیردسته | n | واحد | قیمت (تومان) |
|---|---|---:|---|---|
| میلگرد | میلگرد استیل | 45 | kg | 831,818 – 1,939,090 |
| میلگرد | میلگرد حرارتی | 7 | kg | 72,000 – 74,727 |
| کلاف و مفتول | سیم‌مفتول استیل | 8 | kg | 847,729 – 1,237,354 |
| کلاف و مفتول | سیم‌جوش استیل | 7 | kg | 1,354,545 – 2,181,818 |
| ورق | قلع‌اندود | 8 | kg | 302,454 – 306,309 |
| ورق | آلوزینک (گالوالوم) | 6 | kg | 177,090 – 177,545 |
| ورق | ورق ضد سایش | 6 | kg | 298,181 – 300,000 |
| ورق | ورق دریایی | 5 | kg | 97,729 – 107,727 |
| ورق | گریتینگ | 4 | kg | 176,363 – 854,777 |
| ورق | ورق پانچ سیاه | 2 | **sheet** | 3,226,818 – 4,966,818 |
| لوله | لوله جدار چاه | 13 | kg | 113,133 – 114,400 |
| لوله | لوله گوشت‌دار | 8 | kg | 243,759 – 256,635 |
| پروفیل و قوطی | پروفیل کنگره | 6 | kg | 109,090 – 109,545 |
| نبشی و ناودانی | وال پست | 8 | **branch** | 108,406 – 2,371,676 |
| استیل | لوله استیل | 28 | kg | 886,805 – 1,854,545 |
| استیل | پروفیل استیل | 16 | kg | 618,545 – 857,727 |
| استیل | ناودانی استیل | 6 | kg | 909,090 |
| استیل | نبشی استیل | 5 | kg | 850,909 |
| فلزات رنگی | لوله مسی | 45 | **branch** | 3,634,385 – 16,492,380 |
| فلزات رنگی | تسمه مسی | 18 | kg | 2,520,000 |
| فلزات رنگی | ورق مسی | 9 | kg | 2,481,818 |

Modelling notes worth knowing:

- **ورق پانچ سیاه** is quoted per SHEET, not per kg — 3,226,818 T for a 2 mm
  1000×2000 plate works out to 102,765 T/kg, in line with ahanonline's own ورق
  سیاه, so `unit = 'sheet'`.
- **وال پست** and **لوله مسی** are per piece / per coil → `unit = 'branch'`
  (a 20×300 وال پست is 2.37 M against 108 k for a 10×20 at the same 2 mm wall;
  copper pipe is sold as a 15 m coil).
- **لوله جدار چاه**: ahanonline lists 3 wall thicknesses per (size, mill) within
  0.6 % of each other, so one SKU per (size, mill) at the median — the wall is
  not a price axis there.
- **لوله استیل / پروفیل استیل**: schedule and thickness move the price ~2 %, so
  one SKU per (alloy, size) at the median across schedules.
- **گریتینگ** has no size axis at all — the four SKUs are the four product lines
  (فلزی، گالوانیزه، پله، استنلس استیل), with the line in `grade`.
- **Factory names are ahanonline's brand verbatim** where our catalog has no
  unambiguous match. «کاشان» on the حرارتی page was deliberately NOT resolved
  into «فولاد کویر کاشان» or «امیرکبیر کاشان» — both exist in our catalog and
  guessing would have mis-attributed a price to a mill.
- **`theoretical_weight_kg` is NULL on all 260** — see §3c.
- **One row excluded as a data error**: «سیم جوش استنلس استیل 304L 2» prints
  401,087 against 1,545,454 for every other 304L size on the same table. A 3.9×
  break on one cell is a mistake on their side, not a price.

### 6a. Sub-categories NOT populated — 14 of 35

**ahanonline genuinely lists zero products** on the matching page («۰ محصول —
هیچ موردی … یافت نشد», verified per page by `check_empty.py`):

- استیل: تسمه، توری، مش، تیوب، رینگ، فلنج، فنر استنلس استیل (7)
- فلزات رنگی: لوله آلومینیوم، میلگرد آلومینیوم، سپری آلومینیوم، نبشی آلومینیوم،
  سیم‌جوش آلومینیوم، میلگرد مسی، بوشن مسی (7)

Their category pages exist and are linked from ahanonline's own nav, but the
listings are empty — this is not a scraping miss. Nothing was invented for them.
They will keep showing «به‌زودی در این دسته» until a price source is found; that
needs a different supplier, not another pass over ahanonline.

**One refused for a schema reason:**

- **کوپلر میلگرد** — ahanonline publishes 65 real coupler rows (سایز ۱۶–۴۰ ×
  میانی/تبدیل/انتهایی/یک طرف جوش/جوشی سازه/بغل پیچ/رزوه‌زنی, 28,750–2,530,000
  تومان), but every one of them is priced **per «عدد»**, and `PRICE_UNITS` in
  `web/src/lib/server/db/schema/catalog.ts` is `['kg','branch','sheet','meter']`
  — there is no piece unit. Writing these as `branch` would render «شاخه کوپلر»,
  which is wrong. **This needs a decision from Amir**: adding `'piece'` to
  `PRICE_UNITS` is a one-line enum change plus a migration and four `UNIT_LABEL`
  maps (`components/admin/leads/LeadDetail.tsx`, `app/track/TrackLookup.tsx`,
  `app/api/admin/leads/[id]/items/[itemId]/route.ts`). The data is already
  scraped and sitting in `ahanonline_b.json` ready to load.

---

## 7. Verification

### 7a. Sample verification against live ahanonline

Not against the saved dump — the pages were **re-fetched live** and re-parsed
(`fetch_verify.py` → 20 pages; `verify_a.py`, `verify_b.py`).

- **Part A: 32 of 33 samples matched exactly**, spread deliberately across every
  tier and every category/sub-category combination, matched by ahanonline product
  CODE where one was recorded and by exact price otherwise. The single non-match
  is the T2b row by construction (its price is per-kg × branch weight, so no
  literal published number equals it).
- **Part B: 41 of 42 samples matched exactly** (first and last SKU of every one of
  the 21 populated sub-categories). The single non-match is «پروفیل استیل ۲۰×۲۰ /
  201» at 618,545, which is the median of a published 627,636 and 609,454.

Every price this run wrote is still what ahanonline shows today.

### 7b. Sanity bands before the write

`sanity_a.py`: 0 unit mismatches between `current_prices.unit` and `skus.unit`;
0 per-kg rows outside 60,000–260,000 T/kg; per-category min/max reviewed by hand.

### 7c. Database, before → after

Counts are in §0. `543` rows written to `current_prices` and `543` to
`price_points` in this window — a 1:1 match, so no chart or نوسان history was left
dangling. 173 `is_stale = true` rows remain, all of them deliberate (§4) plus
rows belonging to inactive SKUs.

### 7d. Live site

Loaded through Caddy (port 3000 is not host-exposed). All 200. Pages take up to
300 s to turn over because `revalidate = 300` on the price routes — the first
read after the write still served the cached empty state, the second served the
real table.

| page | before | after |
|---|---|---|
| `/prices/steel` | «به‌زودی در این دسته» empty state | real table, 55 SKUs |
| `/prices/felezat-rangi` | «به‌زودی در این دسته» | real table, 72 SKUs |
| `/prices/sheet/grating` | «به‌زودی در این دسته» | real table, 4 SKUs |
| `/prices/rebar` | 779 × «تماس بگیرید», 0 prices | full price table (میلگرد آجدار ۱۲ ذوب‌آهن اصفهان ۷۸٬۵۴۵ تومان, ۱۴ → ۶۷٬۶۳۶, ۱۶ → ۷۱٬۷۲۷ …) |
| `/prices/ibeam/tirahan` | «تماس بگیرید» | تیرآهن ۱۴ اهواز ۱۰٬۰۰۰٬۰۰۰ تومان/شاخه; تیرآهن ۱۶ اهواز still «تماس بگیرید» (§4, correctly) |
| `/prices/steel/pipe`, `/prices/felezat-rangi/copper-pipe` | did not exist as content | real tables |

### 7e. Typecheck

`tsc --noEmit` reports two errors, both in `web/scripts/activateAndExpandCatalog.ts`
and `web/scripts/addAhanonlineGapSubCategories.ts` — untracked files in the shared
checkout from an earlier session, **not present in this worktree and not touched
by this run**. This pass changed no file under `web/src/`; all of its code lives
in `scripts/` beside this report and runs on the host's Python.

---

## 8. What is in this folder

| file | what |
|---|---|
| `PRICE-FIX-AND-CATALOG-FILL-2026-08-19.md` | this report |
| `prices-written-2026-08-19.csv` | 283 Part-A price writes, one row each, with source page / product / code and old→new |
| `new-skus-2026-08-19.csv` | the 260 new SKUs with every field and their source row |
| `unpriced-flagged-2026-08-19.csv` | the 143 existing SKUs left unpriced, each with a reason and a reference price where one exists |
| `apply_a.sql` · `apply_b.sql` | the exact SQL that was executed, replayable and reviewable |
| `plan_a.json` · `plan_b.json` | the full decision record behind both SQL files |
| `ahanonline_b.json` | 648 newly-scraped ahanonline rows (incl. the 65 کوپلر rows waiting on the unit decision) |
| `scripts/` | every script this run used — fetch, parse, plan, apply, verify, audit |

## 9. Open decisions for Amir

1. **هاش** — 12 SKUs unpriced; the mill attribution on 11 of them looks wrong (§2).
2. **`theoretical_weight_kg` on 185 active SKUs** — feeds پیش‌فاکتور line totals
   and renders as «وزن شاخه». Needs a standard branch length per product line
   before it can be fixed correctly (§3c). **Highest-value item in this report.**
3. **~83 SKUs whose spec is physically impossible** (§5) — fix the spec, or
   deactivate. Nothing was removed.
4. **کوپلر میلگرد** — needs a `'piece'` unit in `PRICE_UNITS`; data ready (§6a).
5. **~30 existing SKUs with a usable reference price but a mill mismatch** (§4) —
   ten minutes in the admin grid closes most of the remaining «تماس بگیرید».
6. **14 sub-categories with no ahanonline source** (§6a) — need a different
   supplier or they stay «به‌زودی».
