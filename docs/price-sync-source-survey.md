# Price-sync source survey — 1405/06/01 (2026-08-23)

Why the automated mirror only refreshed 22% of priced SKUs, which sources can
close the rest, and what was verified rather than assumed.

Every number below came from a live fetch on the date above. Where a claim
could only be supported by a search-engine snippet or a page's own marketing
copy, it is marked as unverified and was not built on.

---

## 1. The starting position

Of **1,133** priced, active SKUs, **251** were written by one of the two
1405/06/01 mirror runs. The other **882** were stale (`current_prices.updated_at`
older than three days).

| Category | Stale |
|---|---:|
| ورق | 238 |
| فلزات رنگی | 188 |
| میلگرد | 153 |
| لوله | 78 |
| پروفیل | 65 |
| استیل | 55 |
| کلاف و مفتول | 40 |
| نبشی و ناودانی | 38 |
| تیرآهن | 27 |

The run log itself was the first useful signal. The 08:30 run considered 432
SKUs and wrote 251 — so the skips were *not* mostly matching failures:

```
write:exact                  251
skip:low-confidence-match    120
skip:no-size-match            46
skip:source-not-per-kg        13
skip:ambiguous-candidates      2
```

432 considered against 1,133 priced means **701 SKUs were never even looked
at** — `loadCandidates` scopes the run to sub-categories present in
`SOURCE_PATHS`, and two thirds of the catalogue was not in it.

## 2. The finding that reframed the task

The brief assumed the gap needed new sites ("ممکنه قیمت‌ها رو از ۸ تا سایت
مختلف برداریم"). It does not.

**ahanonline publishes 352 `/product-category/` pages. The mirror was pointed
at 32 of them.** The 32 were the ones the 1405/05/19 comparison audit happened
to cover; the mirror inherited that list and nobody revisited it. Every single
product line that "no source carries" turned out to be sitting on an ahanonline
page nobody had mapped:

| Our stale line | SKUs | ahanonline page | Priced rows |
|---|---:|---|---:|
| تسمه | 93 | `انواع-ورق/تسمه` | 118 |
| کوپلر | 65 | `میلگرد/کوپلر` | 65 |
| ورق استیل | 47 | `انواع-ورق/ورق-استیل` | 188 |
| ورق آلومینیوم | 24 | `انواع-ورق/ورق-آلومینیوم` | 64 |
| لوله جدار چاه | 13 | `انواع-لوله/لوله-جدار-چاه` | 28 |
| چهارپهلو | 14 | `انواع-ورق/چهارپهلو` | 14 |
| ورق مسی | 9 | `انواع-ورق/ورق-مسی` | 9 |
| ورق شیروانی | 9 | `انواع-ورق/ورق-شیروانی` | 9 |
| آلوزینک | 6 | `انواع-ورق/آلوزینک` | 6 |
| ورق ضد سایش | 6 | `انواع-ورق/ورق-ضد-سایش` | 6 |
| ورق دریایی | 5 | `انواع-ورق/ورق-دریایی` | 5 |
| چهارپهلو آلیاژی | 5 | `انواع-ورق/چهارپهلو-آلیاژی` | 5 |

Row counts are from parsing each page with the production
`parseAhanonlinePage`, not from reading the rendered page.

A strong corroboration fell out of this: for most of these SKUs the price
already stored in `current_prices` matches the ahanonline row to within a few
تومان (تسمه 111,363 against their 111,364; کوپلر and ورق استیل identical to
the rial). These SKUs were originally seeded *from these very pages* by hand,
which both confirms the page↔sub-category mapping is the right one and explains
why nothing had refreshed them since.

### Pages that exist but publish nothing

Verified as 0 priced rows and therefore deliberately **not** mapped — mapping
them would only produce a "page failed" line every run:

`آلومینیوم/میلگرد-آلومینیوم`, `آلومینیوم/لوله-آلومینیوم`,
`آلومینیوم/نبشی-آلومینیوم`, `آلومینیوم/سپری-آلومینیوم`,
`انواع-پروفیل/پروفیل-آلومینیوم`, `استنلس-استیل/تسمه-استنلس-استیل`, `مس`,
`آلومینیوم`.

This is why the 188-SKU فلزات رنگی category cannot be closed the way its size
suggests: ahanonline sells aluminium **sheet** and copper **sheet**, and its
aluminium rebar / pipe / angle / profile pages are SEO shells with no prices.

## 3. The other candidate sources

| Source | Reachable | Structure | Verdict |
|---|---|---|---|
| **esfahanahan.com** | 200, 0.2s | Next.js; every product page embeds `__NEXT_DATA__` with per-variation price, unit, size, grade, delivery place and `price_updated_at` | **Best-quality data of any source, and it closes none of the gap** — see below |
| **ahanjam.com** | 200, 0.2s | WordPress, JSON-LD only | Mentions تسمه/آلومینیوم/استیل; not pursued — ahanonline already covers these with a parser we trust |
| **ahanmelal.com** | 200, 5.8s | custom, JSON-LD only | Slow; same lines as ahanonline |
| **parsianahan.com** | 200 | WooCommerce | No non-ferrous/stainless keywords on the homepage |
| **markazeahan.com** | 200 | Next.js, `Disallow: /api/` | No gap keywords found |
| **kilooton.com** | 200 | `Disallow: /api/*`, non-standard sitemap | تسمه/استیل present; not pursued |
| **shahrahan.com** | 200 | Joomla | Partial keyword overlap |
| **digiahan.com** | 301→200 | custom sitemaps | No gap keywords found |
| **iranahan.com** | connection failed | — | Unreachable from this host |
| **foulad24.com** | 20s timeout | — | Unreachable from this host |
| **tgju-api** (self-hosted) | — | Exposes only `/api/price/currency` and `/api/price/gold` | No commodity/steel endpoints — cannot help |

### esfahanahan.com in detail

Worth recording carefully, because it is the source PR #233 already uses for
شمش and it is tempting to reach for again.

Its data is excellent. All 133 product pages were harvested (**1,308
variations**, 4 failures) and each variation carries an explicit `واحد`, `سایز`,
`آنالیز`/`استاندارد`, `محل تحویل`, `وزن شاخه` and its own `price_updated_at` —
strictly richer than ahanonline's HTML tables, and available on the ordinary
product URL rather than the `Disallow: /api/*` endpoint the billet poller uses.

It nonetheless does **not** close the gap. Its catalogue is:

```
452  میلگرد        94  ورق سیاه       93  نبشی         61  قوطی صنعتی
 87  میلگرد(اصفهان) 53  کلاف          52  ورق روغنی    50  ورق آلیاژی
 38  تیرآهن        31  لوله تست آب    26  توری          …
```

Searching all 1,308 variations for the lines we actually need:

| | آلومینیوم | استیل | استنلس | مس | کوپلر | شیروانی | گریتینگ | تسمه |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| variations | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |

Every line esfahanahan covers is a line ahanonline already covers and the
mirror already syncs. Its value is as a **corroborating second opinion** on
ferrous prices and as the billet feed it already is — not as gap coverage.
Building a second matcher for it would have added a source, a precedence rule
and a failure mode while closing zero stale SKUs.

That is the honest answer to "should this be 8 sources?": **no.** One source,
used properly, covers what eight were being asked to.

## 4. What made the new pages hard, and the rule that solved it

The mirror's identity rule was "the mill must agree" (`factoryScore >= 0.999`).
That works for the ferrous lines because ahanonline brands every ferrous row.
The new pages mostly do not brand anything, because the mill is not what sets
the price:

- **ورق استیل** — `آلیاژ` 304L vs 316L is a **1.7×** difference (640,909 vs
  1,109,091 تومان/kg). No mill is published at all.
- **کوپلر** — `نوع` at one size ranges 82,800 → 1,196,000 تومان (**14×**).
- **تسمه** — `حالت` (نوردی / فابریک / ماشینکاری) sets the price; within a
  حالت every width carries the same number.

Dropping to "same size wins" for these is exactly the failure the ambiguity
gates exist to prevent — the same failure that once priced «نبشی لقمه ۱۰» from
a «نبشی 10*100*100» row at +121%.

The rule shipped instead **generalises the identity without relaxing it**: each
family declares which column carries its identity and where our copy of it
lives (`IDENTITY` in `priceSync.match.ts`). The bar is unchanged — an explicit,
published token must agree on both sides — only the *field* varies. A SKU that
does not carry the discriminator is skipped under a new reason that says so:

- `skip:sku-missing-variant` — the source distinguishes rows by آلیاژ/نوع/حالت
  and our SKU does not say which. **Fixable in our catalogue.**
- `skip:source-has-no-variant` — the source published no discriminator on any
  candidate row, so its rows differ only by size. **Not mirrorable.**

### Lines deliberately left unmatched

| Line | SKUs | Why |
|---|---:|---|
| میلگرد استیل | 45 | Their rows are keyed on 304L/310S/316L; our SKU names carry a *country* (هند/تایوان/چین) and no alloy. The country does not move the price and the alloy does. |
| لوله استیل | 28 | Keyed on `رده` (schedule 10/40/80); our names carry neither رده nor alloy. Our own catalogue also holds duplicates of the same size at 886,805 and 1,700,000 — a data problem to settle before mirroring, not with it. |
| لوله مسی | 45 | `price_basis = 'coil'`; no page publishes a per-coil price. Also 3 duplicate rows per (size, mill) at different prices. |
| تسمه مسی | 18 | All 18 rows carry **one** price for 18 different sections with no unit column. Un-mirrorable at any confidence. |
| سیم‌مفتول / سیم‌جوش استیل | 15 | Keyed on آلیاژ; our names omit it. |
| وال پست | 8 | `price_basis = 'branch'`; source publishes no matching unit. |
| ساندویچ پانل, گریتینگ | 10 | `sqm` basis and free-text «نام کالا» sizes with no stable identity. |

These are reported, not forced.

## 5. Result

A dry run of the production `matchSku` against the live SKU export and the
freshly fetched pages:

| Sub-category | Would write / stale |
|---|---:|
| sheet/strip (تسمه) | 93 / 93 |
| rebar/coupler | 65 / 65 |
| sheet/steel | 47 / 47 |
| felezat-rangi/aluminum-sheet | 19 / 24 |
| profile/chaharpahlu | 14 / 14 |
| pipe/well-casing | 13 / 13 |
| felezat-rangi/copper-sheet | 9 / 9 |
| sheet/roofing | 9 / 9 |
| sheet/aluzinc | 6 / 6 |
| sheet/wear-resistant | 6 / 6 |
| sheet/marine | 5 / 5 |
| profile/chaharpahlu-alloy | 5 / 5 |
| **Total** | **291** |

**Zero** of the 291 moves the stored price by more than 25%, which is the
strongest available evidence that the mapping is right rather than merely
permissive. The 4 refusals left are all «this mill does not stock this
thickness» (ورق آلومینیوم ۴ پارس against an اراک-only row) — correct.

Coverage goes from **251/1,133 (22%)** to **542/1,133 (48%)**.

## 6. Cadence

Unchanged: the existing 08:00/12:00 Asia/Tehran cron. The new pages publish a
per-row «تاریخ بروزرسانی» and the observed values are same-day or one day old
(1405/6/1 and 1405/5/31), i.e. these pages move on the same daily rhythm as
the ones already synced. Nothing here justifies a second cadence, and the
existing `maxSourceAgeDays: 10` gate already declines to copy a row ahanonline
themselves stopped maintaining.

No new source was added, so there is no precedence rule to define. If a second
source is ever added, `price_sync_runs.source` and `price_sync_entries.source`
already exist to record which one won a given write.

## 7. Reproducing this

The survey scripts were one-off and are not committed. To redo it:

1. `GET https://ahanonline.com/sitemap/product-types/1/index.xml/` and extract
   every `/product-category/` path (352 today).
2. Fetch each candidate page and parse with `parseAhanonlinePage` — the same
   function the job uses, so the counts are what the job would see.
3. Diff the result against `AHANONLINE_TARGETS`.

Step 3 is the one worth repeating periodically: this whole gap existed because
a page list captured once in 1405/05 was never checked again.

---

## 8. Third pass — 1405/06/03 (2026-08-26)

§7 said step 3 was "the one worth repeating periodically". It had not been
repeated. Repeating it accounts for most of what was still missing.

### 8.1 The sitemap diff, run again

`sitemap/product-types/1/index.xml` lists **350** `/product-category/` pages
today. **51** were mapped. Filtering the other 299 to lines our catalogue
carries and parsing each with `parseAhanonlinePage` found a live, priced page
for nearly every sub-category the previous two passes had recorded as having
no source at all:

| Our line | SKUs | Page | Rows | Result |
|---|---:|---|---:|---|
| وال پست | 8 | `نبشی-و-ناودانی/وال-پست` | 8 | 8/8 |
| تسمه مسی | 18 | `انواع-ورق/تسمه-مسی` | 18 | 18/18 |
| لوله مسی | 15 | `انواع-لوله/لوله-مسی` | 54 | 15/15 |
| میلگرد حرارتی | 7 | `میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی` | 9 | 7/7 |
| ورق کرکره | 6 | `انواع-ورق/ورق-کرکره` | 9 | 5/6 |
| قلع‌اندود | 6 | `انواع-ورق/قلع-اندود` | 8 | 6/6 |
| پروفیل کنگره | 6 | `انواع-پروفیل/پروفیل-کنگره` | 6 | 6/6 |
| ساندویچ پانل | 4 | `انواع-ورق/ساندویچ-پانل` | 6 | 4/4 |
| گریتینگ | 1 | `انواع-ورق/گریتینگ/گریتینگ-گالوانیزه` | 4 | 1/1 |
| ورق پانچ سیاه | 1 | `انواع-ورق/ورق-پانچ-سیاه` | 2 | 0/1 — see below |

The strongest evidence that these mappings are right rather than merely
permissive is that each family lands on a **single constant delta** against our
stored price, which is what a hand-seeded catalogue that has not been refreshed
looks like: تسمه مسی 0.0% × 18, ساندویچ پانل 0.0% × 4, وال پست 5.0% × 7,
کرکره 5.3% × 5, قلع‌اندود 7.5% × 5, کنگره 7.5% × 6, گریتینگ 4.7%. لوله مسی
lands on 13.1% / 16.8% / 19.7% by mill — which is ahanonline's own published
نوسانات for باهنر, بابک and مهر اصل that day.

### 8.2 Checked and deliberately not mapped

| Page | Why not |
|---|---|
| `آلومینیوم/میلگرد-آلومینیوم`, `آلومینیوم/لوله-آلومینیوم`, `آلومینیوم/نبشی-آلومینیوم`, `آلومینیوم/سپری-آلومینیوم`, `انواع-پروفیل/پروفیل-آلومینیوم`, `لوله-آلومینیوم-2`, `میلگرد-مسی`, `بوشن-مسی`, `مس`, `آلومینیوم`, `استنلس-استیل/تسمه-استنلس-استیل` | Resolve, parse to **zero** priced rows. SEO shells. Unchanged from the second pass. |
| `انواع-ورق/ورق-آلومینیوم-رنگی` | 14 priced rows but «تاریخ بروزرسانی» 1405/5/20 — fourteen days stale, so `maxSourceAgeDays` refuses every row anyway. Worth re-checking if they resume maintaining it. |
| `تیرآهن-و-هاش/تیرآهن/تیرآهن-لانه-زنبوری` | 5 priced rows, all «شاخه». Our 4 لانه‌زنبوری SKUs are per-kg, so mirroring needs `theoretical_weight_kg` — the conversion this job never does. |
| `نبشی-و-ناودانی/نبشی/*` and `.../ناودانی/*` per-mill children (20 pages) | Fetched and parsed. They add اصفهان, اروپا, سپهر ایرانیان, کوهپایه, ابهر — but of our skipped نبشی/ناودانی SKUs only one mill (سپهر ایرانیان, 3 rows) is reachable that way, and ظهوریان/دهشیر یزد have no child page at all. 20 fetches per run for ~1 SKU. Not worth it; the nearest-analog fallback covers those families instead. |

`انواع-ورق/ورق-پانچ-سیاه` **is** mapped, and lands on `ambiguous` every run —
deliberately. Its two rows are both ضخامت 2 فولاد مبارکه and differ only by
ابعاد (1000×2000 at 3,438,182 against 1250×2500 at 5,345,455, a 55% spread);
our SKU records no ابعاد. Mapping it makes the admin log say *why* instead of
saying nothing.

### 8.3 markazeahan.com — the second source, and the first one that was needed

The second pass reported markazeahan as "no gap keywords found on the
homepage". That was true of the homepage and false of the site: it carries
dedicated `/product-category/` pages for every aluminium extrusion line, which
is the one thing ahanonline publishes nothing for.

| Our line | SKUs | Page | Ours | Theirs |
|---|---:|---|---:|---:|
| لوله آلومینیوم | 13 | `aluminium-pipe` | 640,000 | 640,000 |
| نبشی آلومینیوم | 7 | `aluminum-studs` | 630,000 | 630,000 |
| ناودانی آلومینیوم | 8 | `aluminum-channel-beam` | 630,000 | 630,000 |
| پروفیل آلومینیوم | 4 | `پروفیل-آلومینیم` | 650,000 | 650,000 |

Each line is one per-kg price across every size — ingot plus a conversion
charge, which is how aluminium extrusion is sold here.

Two safety nets this source does **not** give us, both load-bearing:

1. **No `data-price`.** ahanonline publishes the price twice (rial attribute,
   toman text) and the parser refuses any row where the two disagree. This one
   publishes it once, so `PRICE_BANDS` is the only thing between a units change
   and a 10× write. All four families carry a band, at ±40% rather than the
   usual near-10×.
2. **The freshness date is per page, not per row.** It is stamped onto every
   row so the existing `maxSourceAgeDays` gate works unchanged, and a page that
   *loses* the stamp parses to zero rows and is reported as a failed fetch.

Their price cell leads with the day's movement — «+ 2.4% 630,000» — so
`priceFromCell` takes the last thousands-grouped run and requires the grouping.
Read left to right that cell gives 2.

**`aluminum-rebar` is not mapped**, and this is the pass's most important
negative. Its flat 620,000 equals what our 57 میلگرد آلومینیوم SKUs hold, but
its own «به روز رسانی» reads **1405/02/12** — ~110 days — and 30 of its 40 rows
say «تماس بگیرید». That is two stale numbers agreeing, not a live quote;
ahanyekta's equivalent page is staler still (1404/03/07). Aluminium rebar is
not a line the Iranian aggregators keep current.

Robots: markazeahan disallows `/api/`, `/rest/`, `/shop/`, `/category/`,
`/productbox/` and every `*?*` URL. `/product-category/` is not disallowed and
is the only thing requested.

### 8.4 Precedence

§6 said "if a second source is ever added, `price_sync_runs.source` … already
exist to record which one won a given write." In practice **no precedence rule
was needed**: markazeahan is mapped only to four families ahanonline publishes
nothing for, so no SKU can be priced by both. `price_sync_runs.source` stays
`ahanonline` because it names the *run*, and the service comment records what
has to change the day two sources can reach the same SKU.

Rows carry `sourcePath = markazeahan/<slug>`; ahanonline's paths are Persian
category names, so the prefix routes each path to exactly one fetcher. A test
asserts the two sets stay disjoint.

### 8.5 Cadence

Still unchanged. The new ahanonline pages publish same-day «تاریخ بروزرسانی»;
markazeahan's four mapped pages read 1405/06/03 and 1405/05/28, inside the
existing 10-day gate.

### 8.6 Reproducing this pass

1. Steps 1–3 of §7, against the current sitemap — this is the step that keeps
   paying and the one that keeps being skipped.
2. For markazeahan: `GET /product-category/<slug>/`, parse with
   `parseMarkazeahanPage`, and **read the page's «به روز رسانی» stamp before
   trusting any number on it.** That single check is what separates the four
   pages worth mapping from the one that is not.
