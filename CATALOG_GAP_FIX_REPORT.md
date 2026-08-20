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
| Active sub-categories with zero products | 24 | **16** |
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

The drop in "SKUs carrying a weight" from 425 to 228 is the point of §2, not a regression: 197 of those were fabricated numbers and are now honestly null.

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

### Out of scope, untouched as instructed

The products/Navbar mega-menu redesign, and the FAQ / article / comments-under-factory-page work. The `feat/price-table-by-factory` worktree was left alone.
