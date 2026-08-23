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
