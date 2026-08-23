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
