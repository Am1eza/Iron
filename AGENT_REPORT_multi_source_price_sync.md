# AGENT_REPORT — multi-source price sync (US-05.3)

**Date:** 1405/06/01 · 2026-08-23
**Branches:** `price-sync-source-survey` (docs) · `price-sync-expand-coverage` (code)
**Both left open for review. Neither merged.**

---

## The headline

The brief asked for prices from up to eight more Iranian steel sites to close a
78% coverage gap. **That is not what the gap was.**

ahanonline publishes **352** `/product-category/` pages. The mirror was pointed
at **32** of them — the set the 1405/05/19 comparison audit happened to cover,
inherited by the job and never revisited. Every product line believed to have
"no source" was sitting on an ahanonline page nobody had mapped.

Coverage goes from **251/1,133 (22%)** to **542/1,133 (48%)** by adding twelve
pages and generalising one rule. No new source was added, because the survey
showed no new source was needed — and the most promising candidate would have
closed exactly zero stale SKUs.

## How the gap was actually shaped

The run log was the first real signal, and it contradicted the framing:

```
considered 432 SKUs · wrote 251 · skipped 181
```

432 considered against 1,133 priced means **701 SKUs were never looked at at
all**. They were not failing to match; they were out of scope before matching
began.

## Survey results

Full detail in `docs/price-sync-source-survey.md`. Every number below is from a
live fetch on 1405/06/01, parsed with the production `parseAhanonlinePage` so
the counts are what the job would see — not read off a rendered page and not
taken from a search snippet.

### ahanonline — pages that exist, publish prices, and were unmapped

| Our line | Stale SKUs | Page | Rows |
|---|---:|---|---:|
| تسمه | 93 | `انواع-ورق/تسمه` | 118 |
| کوپلر | 65 | `میلگرد/کوپلر` | 65 |
| ورق استیل | 47 | `انواع-ورق/ورق-استیل` | 188 |
| ورق آلومینیوم | 24 | `انواع-ورق/ورق-آلومینیوم` | 64 |
| چهارپهلو | 14 | `انواع-ورق/چهارپهلو` | 14 |
| لوله جدار چاه | 13 | `انواع-لوله/لوله-جدار-چاه` | 28 |
| ورق مسی | 9 | `انواع-ورق/ورق-مسی` | 9 |
| ورق شیروانی | 9 | `انواع-ورق/ورق-شیروانی` | 9 |
| آلوزینک | 6 | `انواع-ورق/آلوزینک` | 6 |
| ورق ضد سایش | 6 | `انواع-ورق/ورق-ضد-سایش` | 6 |
| ورق دریایی | 5 | `انواع-ورق/ورق-دریایی` | 5 |
| چهارپهلو آلیاژی | 5 | `انواع-ورق/چهارپهلو-آلیاژی` | 5 |

A strong corroboration: for most of these the price already in `current_prices`
matches the ahanonline row to within a few تومان (تسمه 111,363 vs their
111,364; کوپلر and ورق استیل identical to the rial). These SKUs were seeded by
hand *from these very pages* — which confirms the page↔sub-category mapping and
explains why nothing had refreshed them since.

Eight further pages resolve but publish **zero** priced rows and were
deliberately not mapped (`آلومینیوم/میلگرد-آلومینیوم`,
`آلومینیوم/لوله-آلومینیوم`, `آلومینیوم/نبشی-آلومینیوم`,
`آلومینیوم/سپری-آلومینیوم`, `انواع-پروفیل/پروفیل-آلومینیوم`,
`استنلس-استیل/تسمه-استنلس-استیل`, `مس`, `آلومینیوم`). This is why the 188-SKU
فلزات رنگی category cannot be closed the way its size suggests: ahanonline
sells aluminium and copper *sheet*, and its aluminium rebar/pipe/angle/profile
pages are SEO shells.

### The other ten candidates

| Source | Verdict |
|---|---|
| **esfahanahan.com** | Best data of any source; closes **none** of the gap — see below |
| ahanjam.com, ahanmelal.com, kilooton.com, shahrahan.com | Reachable, carry some of the same lines; not pursued once ahanonline covered them with a parser already trusted in production |
| parsianahan.com, markazeahan.com, digiahan.com | No gap keywords found on the homepage |
| iranahan.com, foulad24.com | Unreachable from this host (connection failure / 20s timeout) |
| self-hosted `tgju-api` | Exposes only `/api/price/currency` and `/api/price/gold`; no commodity endpoints |

### esfahanahan.com — the honest negative result

Worth stating plainly, because it is the obvious next reach: it is already our
شمش feed (PR #233) and its data is genuinely better than ahanonline's. Every
product page embeds `__NEXT_DATA__` with per-variation price, explicit `واحد`,
`سایز`, `آنالیز`, `محل تحویل`, `وزن شاخه` and its own `price_updated_at` — on
an ordinary product URL, not the `Disallow: /api/*` endpoint the billet poller
uses.

All 133 product pages were harvested: **1,308 variations, 4 failures.**
Searching every one of them for the lines we need:

| آلومینیوم | استیل | استنلس | مس | کوپلر | شیروانی | گریتینگ | تسمه |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |

Its catalogue is میلگرد (539), ورق سیاه (94), نبشی (93), قوطی, تیرآهن, کلاف —
every one a line ahanonline already covers and the mirror already syncs.
Building a second matcher for it would have added a source, a precedence rule
and a failure mode while closing zero stale SKUs. It remains valuable as a
corroborating second opinion on ferrous prices and as the billet feed it is.

**So: full 8-source coverage is not realistic, and more importantly not
useful.** One source, used properly, covers what eight were being asked to.

## What was built

### The identity rule, generalised — not relaxed

The new pages mostly do not brand their rows, because the mill is not what sets
the price:

- **ورق استیل** — `آلیاژ` 304L vs 316L is **1.7×** (640,909 vs 1,109,091 T/kg); no mill published at all
- **کوپلر** — `نوع` at one size spans **14×** (82,800 → 1,196,000 T/عدد)
- **تسمه** — `حالت` (نوردی/فابریک/ماشینکاری) is **1.5×**

The old rule was "the mill must agree". Dropping to "same size wins" for these
would be the exact failure that once priced «نبشی لقمه ۱۰» from a plain نبشی
row at +121%.

`IDENTITY` instead lets each family declare which column carries its identity
and where our copy of it lives (`factory`, or tokens in the SKU name). **The
bar is unchanged** — an explicit, published token must agree on both sides —
only the *field* varies. Two new skip reasons keep the failure modes apart:

- `skip:sku-missing-variant` — the source distinguishes by آلیاژ/نوع/حالت and
  our SKU does not say which. **Fixable in our catalogue**, and the admin page
  now names it in Persian.
- `skip:source-has-no-variant` — their rows differ only by size. Not mirrorable.

### Three supporting changes

- **`PRICE_BANDS`** — the global 10k–500k band is carbon-steel-per-kg. 316L at
  1,109,091 and copper sheet at 2,481,818 are *correct* prices it would have
  discarded. Per-family bands remain far tighter than the 10× rial/toman flip
  the band exists to catch; the global band is untouched.
- **`unitMatchesBasis`** — کوپلر is «عدد» on both sides, so 65 per-piece SKUs
  became like-for-like. Still no conversion, ever.
- **A latent `norm` bug** — U+066B (Persian decimal separator) was not folded,
  so «۱٫۵» parsed as *two* numbers, 1 and 5, and a 1.5mm sheet size-matched the
  1mm row. Harmless until now; hit immediately by the sub-millimetre gauges
  these pages are keyed on.

## Verification

The production `matchSku` was run against the live SKU export and the freshly
fetched pages (a throwaway harness, not committed):

| Sub-category | Writes / stale |
|---|---:|
| sheet/strip (تسمه) | 93 / 93 |
| rebar/coupler | 65 / 65 |
| sheet/steel | 47 / 47 |
| felezat-rangi/aluminum-sheet | 19 / 24 |
| profile/chaharpahlu | 14 / 14 |
| pipe/well-casing | 13 / 13 |
| felezat-rangi/copper-sheet | 9 / 9 |
| sheet/roofing | 9 / 9 |
| sheet/aluzinc, sheet/wear-resistant | 6 / 6 each |
| sheet/marine, profile/chaharpahlu-alloy | 5 / 5 each |
| **Total** | **291** |

**Zero of the 291 move a stored price by more than 25%** — the strongest
available evidence that the mapping is right rather than merely permissive. The
4 refusals left are all "this mill does not stock this thickness" (ورق
آلومینیوم ۴ پارس against an اراک-only row).

Gates: `tsc --noEmit` clean on all touched files (three pre-existing
`ahantime-logo.png` import errors are unrelated and present on `main`);
`next lint` clean; **55 tests pass** (40 in the matcher — 15 new — plus the
service and integration suites). Per the brief the full vitest suite was not
run on this box; CI will.

## Before / after

| | Fresh SKUs | Share |
|---|---:|---:|
| Before | 251 / 1,133 | 22% |
| After | 542 / 1,133 | **48%** |

## Deliberately left alone

Reported rather than forced, with the reason:

| Line | SKUs | Why |
|---|---:|---|
| میلگرد استیل | 45 | Keyed on 304L/310S/316L; our names carry a *country* (هند/تایوان/چین), which does not move the price, and no alloy |
| لوله مسی | 45 | `price_basis='coil'`; no page publishes a per-coil price |
| لوله استیل | 28 | Keyed on `رده`; our names carry neither رده nor alloy |
| تسمه مسی | 18 | One price published for 18 different sections, no unit column |
| سیم‌مفتول / سیم‌جوش استیل | 15 | Keyed on آلیاژ; our names omit it |
| ساندویچ پانل, گریتینگ, وال پست | 18 | `sqm`/`branch` bases with no matching source unit |

## Two catalogue problems found on the way

Not fixed here — both are owner decisions, and neither is a sync bug:

1. **لوله مسی has triplicated SKUs** — three rows per (size, mill) at three
   different prices (e.g. ۱/۲ اینچ بابک at 8,521,500 / 10,094,700 /
   10,881,300). Mirroring would write one price onto all three and hide the
   duplication.
2. **لوله استیل holds the same size at 886,805 and 1,700,000** — an ~2×
   internal disagreement that should be settled before any source writes to it.

## Follow-ups worth doing

- **Re-diff `AHANONLINE_TARGETS` against their sitemap periodically.** This
  whole gap existed because a page list captured once in 1405/05 was never
  checked again. `docs/price-sync-source-survey.md` §7 has the three steps.
- **Add the alloy to میلگرد استیل and رده to لوله استیل SKU names** — that
  alone converts 73 `skip:sku-missing-variant` rows into writes with no code
  change, and the admin page now tells the owner exactly which SKUs they are.
