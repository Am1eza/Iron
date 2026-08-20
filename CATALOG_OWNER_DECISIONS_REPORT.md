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
| **ناودانی آلومینیوم** | 8 live, priced rows at 630,000 on the approved source. Needs a new sub-category; was not in this pass's scope. |
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
- One flake worth naming rather than hiding: the post-merge `CI / checks` run on `main` failed on
  `src/lib/auth/service.test.ts > rotates the refresh token`, a wall-clock grace-window assertion
  in a file this pass does not touch. It passed on the PR run with the identical tree, passes in
  isolation here, and **the re-run of that job on `main` came back green** — a flake, not a
  regression.

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
