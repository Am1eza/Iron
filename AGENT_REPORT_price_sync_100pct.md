# AGENT_REPORT — pushing price-sync toward 100% coverage (US-05.3)

**Date:** 1405/06/03 · 2026-08-26
**Branches / PRs, all pushed to `origin`, none merged:**

| PR | Branch | Title |
|---:|---|---|
| [#279](https://github.com/Am1eza/Iron/pull/279) | `price-sync-new-source-pages` | mirror the 11 specialty pages the sitemap diff turned up |
| [#280](https://github.com/Am1eza/Iron/pull/280) | `price-sync-nearest-analog` | price a SKU from its nearest analog, flagged as تخمینی |
| [#281](https://github.com/Am1eza/Iron/pull/281) | `price-sync-markazeahan-aluminium` | add markazeahan as a second source for the aluminium extrusions |
| [#282](https://github.com/Am1eza/Iron/pull/282) | `price-sync-100pct-report` | this report + the survey doc's third pass |

They are **stacked in that order** (#280 targets #279, #281 targets #280, #282
targets #281). Review and merge front to back. Because this repo squash-merges,
each follow-up will need `git rebase --onto origin/main <old-base> <branch>`
after the one before it lands.

---

## 1. The headline

| | Written | Share of 782 active SKUs |
|---|---:|---:|
| **Live in production right now** | 349 | **44.6%** |
| Baseline on `main`'s code | 420 | 53.7% |
| after #279 | 502 | 64.2% |
| after #280 | 537 | 68.7% |
| after #281 | **565** | **72.3%** |

Two separate things are in that first gap and they need different actions.

**The production container is 40 commits behind `main`.** It runs
`ghcr.io/am1eza/iron-web:d2088f95`, which predates PR #243 — the one that
unlocked the seven استیل families by reading the alloy out of `skus.grade`.
That is 78 SKUs already fixed, merged, and simply not deployed. **The single
highest-value action tonight is a deploy, before any of these PRs.** It moves
live coverage 349 → 420 with code that is already reviewed.

Everything below is measured against the 420 baseline, not the 349, so no
credit is taken for work that was already done.

## 2. Methodology, so the numbers are reproducible

Every figure comes from running the **production** `parseAhanonlinePage`,
`parseMarkazeahanPage` and `matchSku` — not a re-implementation — against:

* the live SKU export (`782` rows, `is_active = true`, exported 2026-08-26 05:2x UTC), and
* all 65 source pages fetched the same morning.

To redo it:

```sql
select count(*) from skus where is_active = true;
select started_at, source_rows, considered_skus, written, skipped
  from price_sync_runs order by started_at desc limit 5;
```

```sql
-- per-sub-category truth for the last run
with run as (select id from price_sync_runs order by started_at desc limit 1),
e as (select sku_id, outcome, reason from price_sync_entries where run_id=(select id from run))
select c.slug, sc.slug, count(*) n,
       count(*) filter (where e.sku_id is null) never,
       count(*) filter (where e.outcome='written') wrote,
       string_agg(distinct e.reason,',') filter (where e.outcome='skipped') reasons
from skus s join sub_categories sc on sc.id=s.sub_category_id
            join categories c on c.id=s.category_id
       left join e on e.sku_id=s.id
where s.is_active group by 1,2 order by never desc, n desc;
```

Note the trap: `price_sync_runs.considered_skus` counts only SKUs whose
sub-category has a `SOURCE_PATHS` entry. It read **529** — so the run log's
"349 written of 529 considered, 66%" is not the coverage number. Against all
782 active SKUs it is 44.6%. Every figure in this report is against 782.

## 3. What was actually wrong

The prior report's numbers were three days old and the catalogue had moved
under them (میلگرد استیل 45 → 32, لوله مسی 45 → 15). Re-derived from scratch,
the 362-SKU gap on `main` was:

* **175 never considered** — no `SOURCE_PATHS` entry at all.
* **187 skipped**, of which 113 `low-confidence-match` and 47 `no-size-match`.

The prior report attributed most of the first group to lines "ahanonline
structurally does not sell". That was true of four aluminium pages and wrong
about everything else. **ahanonline's sitemap lists 350 `/product-category/`
pages; the job was pointed at 51.** وال پست, گریتینگ, ساندویچ پانل, ورق کرکره,
پروفیل کنگره, قلع‌اندود, میلگرد حرارتی, لوله مسی and تسمه مسی all had a live,
priced page nobody had mapped.

This is the same failure as the first pass, one level down: §7 of
`docs/price-sync-source-survey.md` explicitly asked for the sitemap diff to be
re-run periodically, and it never was.

## 4. What each PR does

### #279 — eleven more ahanonline pages (+82 SKUs, 420 → 502)

Full detail in the PR and in the survey doc's new §8. The mechanisms are all
"read a field that was already published":

* `PAGE_UNIT` — three tables publish no «واحد» and are not per-kg (وال پست per
  شاخه, ورق پانچ per برگ).
* `HALAT_UNIT` — لوله مسی sells the same size, mill and ضخامت as a 15-متری coil
  and a 6-متری length, **3.5× apart**, and «حالت» is the only thing that says
  which. Modelled as the row's unit, which lines it up with
  `price_basis = 'coil'` on all fifteen SKUs.
* `from: 'size-only'` — four families whose mapped page sells one product and
  publishes no mill on either side. **This is the mode that caused the «نبشی
  لقمه ۱۰» +121% write**, so it is opt-in per family and does not bypass the
  ambiguity gate: if one of those tables gains a second variant, its rows
  spread apart and the family starts skipping on its own.
* `from: 'grade-number'` — «ضخامت ۰.۸۱» vs «0.81». Numbers, not strings.
  Deliberately never used for alloys, where «304» ⊂ «304L».
* `GROUP_COLUMN`, `NAME_FACTORY_PATHS`, plus «اسپیرال» as a factory stopword
  (which alone turns all 12 لوله اسپیرال SKUs from fuzzy-and-skipped into
  **exact** — they were the same mill written two ways) and `ظفر بناب → بناب`.

**Evidence it is right and not merely permissive:** of 502 writes, exactly one
moves a stored price by more than 25%, and each new family lands on a single
constant delta — the signature of a hand-seeded catalogue that stopped being
refreshed. تسمه مسی 0.0% × 18. ساندویچ پانل 0.0% × 4. وال پست 5.0% × 7.
قلع‌اندود 7.5% × 5. کنگره 7.5% × 6. کرکره 5.3% × 5. لوله مسی 13.1/16.8/19.7%
by mill — ahanonline's own published نوسانات for باهنر, بابک and مهر اصل that
day.

### #280 — nearest analog, flagged as an estimate (+35 SKUs, 502 → 537)

This is the part you asked for, and it is deliberately narrower than "find a
similar product", because that question is unanswerable and answering it is
exactly how «نبشی لقمه ۱۰» got priced off a plain نبشی row.

It asks instead: **does the mill move the price in this family, right now, on
this page?** The source answers it. If every size-matching, unit-compatible,
in-band, fresh row agrees within 5%, then the mill demonstrably is not what
sets the price for that size today, and their median *is* the market rate. If
they disagree, the mill matters and the SKU skips exactly as before.

Five constraints, in rough order of how much they matter:

1. **Corroboration, not arithmetic.** A single row has a 0.0% spread by
   definition and proves nothing — that is the shape of the audit's worst
   write, «تیرآهن هاش سبک ۱۸ فایکو» from one ذوب آهن row at **+447%**. So an
   analog needs ≥2 distinct published mills agreeing, *or* a page that brands
   no row at all (پروفیل گالوانیزه groups by thickness: one published market
   price, nothing claiming to be a mill's). Exactly one mill is refused. This
   rule cost 22 SKUs against a naive spread gate and it is the most important
   line in the change. **It was found by a test, not by inspection** — an
   existing case asserting the +447% scenario went green when it should not
   have.
2. **Never past a variant.** An آلیاژ / نوع / حالت / رده disagreement returns
   before the fallback is reached. Nearest-analog fills a gap in the source's
   *mill* coverage and nothing else. This is your safety lesson, encoded.
3. **Never across a size.** The pool is the rows the exact path already
   size-matched. Nothing interpolates. (See §6 — this is the one place where I
   deliberately did less than the brief allowed, with a number attached.)
4. **Every downstream gate re-applied** — unit, price band, freshness,
   factory-gate delivery preference.
5. **`ANALOG_DENYLIST`** — تیرآهن, تیرآهن سبک, هاش سبک, هاش سنگین, پروفیل Z.
   The beam pages interleave domestic and imported stock, which is a different
   product rather than a spread, and on a given day a size can list only mills
   that happen to agree.

**Telling an estimate apart from a mirrored price**, end to end:

* `write:nearest-analog` — a distinct reason on every `price_sync_entries` row;
* `current_prices.price_is_estimated` — migration `0045`, additive and
  defaulted, so every existing row keeps meaning `FALSE`;
* the flag **clears itself** on any other write. A human typing a price into
  the admin grid is the act of replacing an estimate with a real number, so no
  caller has to remember to clear it;
* the admin sync panel labels those rows **«قیمت تخمینی بر اساس نزدیک‌ترین
  محصول مشابه»** in a `warning` badge rather than the `success` one an exact
  write gets.

`maxAnalogSpreadPct` is a stored setting and **0 turns the whole feature off** —
a kill switch separate from `enabled`, so you can drop the estimates without
losing the 502 exact writes with them.

Why 5%: chosen from the data. Across the 35 SKUs it admits, the move against
the stored price runs **−2.2% to +9.2%, median 6.6%** — which is the margin our
catalogue already sits below ahanonline by on the families that *do* match
exactly. 8% adds 8 more SKUs, 25% adds 34, all in families whose rows visibly
disagree about the product.

### #281 — markazeahan, for the aluminium extrusions (+28 SKUs, 537 → 565)

ahanonline's five aluminium-extrusion pages resolve, rank and parse to **zero**
priced rows. They are SEO shells, re-confirmed 1405/06/03. No further work on
that mirror reaches those 89 SKUs.

markazeahan publishes all of them, and our stored price equals theirs **to the
toman** on every line (لوله 640,000, نبشی 630,000, ناودانی 630,000, پروفیل
650,000). 28 of 32 write; the 4 that do not are sizes their table does not
carry.

Taking a second source on means taking its weaknesses on, and both are
load-bearing: it publishes the price **once** (no rial cross-check, so
`PRICE_BANDS` alone stands between a units change and a 10× write — hence ±40%
bands), and its freshness date is **per page**, stamped onto every row so the
existing gate works, with a page that loses the stamp parsing to zero rows.

No precedence rule was needed: markazeahan is mapped only to families
ahanonline publishes nothing for, so no SKU can be priced by both.

---

## 5. What is still not priced, and why — all 217

| Bucket | SKUs | Closeable? |
|---|---:|---|
| میلگرد آلومینیوم | 57 | **No** — see below |
| Source does not carry the size (`no-size-match`) | 58 | Only by crossing a size — §6 |
| Mill published on both sides and disagrees, spread too wide (`low-confidence-match`) | 66 | No — the mill is the product there |
| تیرآهن / هاش priced per شاخه against our per-kg SKUs | 15 | Only via `theoretical_weight_kg` — §6 |
| `sku-missing-variant` / `ambiguous` / `sku-has-no-factory` | 7 | **Yes, in our own catalogue** — §7 |
| Never considered: نبشی لقمه, نبشی بال نامساوی, لانه‌زنبوری | 14 | No — deliberately unmapped, §7 |

### میلگرد آلومینیوم — 57 SKUs, and I could not price them honestly

This is the largest single block left and the one I most wanted to close.
markazeahan carries the line at 620,000, exactly matching our stored price —
which looks like a 57-SKU win until you read the page's own «به روز رسانی»:
**1405/02/12, about 110 days ago**, with 30 of its 40 rows reading «تماس
بگیرید». Our number and theirs agree because *both* stopped moving.
ahanyekta's equivalent page is staler still (1404/03/07).

Aluminium rebar is not a line the Iranian price aggregators keep current. The
page is left unmapped rather than fetched twice a day to be thrown away by the
freshness gate. **These 57 SKUs cannot be automatically priced from any public
source I could find that maintains its numbers**, and I would rather say that
than write 620,000 twice a day and have it look fresh.

---

## 6. Two things I deliberately did NOT do, with the numbers

You explicitly allowed nearest-size interpolation. I did not implement it, and
here is the trade so you can overrule me:

**Nearest *size* would close up to 58 more SKUs** (`no-size-match`) — لوله
گوشت‌دار ۸۳×۴۳, پروفیل استیل ۱۰۰×۱۰۰, ورق گالوانیزه ۴/۵/۶, لوله مبلی
۳/۴/۵ اینچ, توری ۴/۵.۵/۶.۵ and so on. That would take coverage to roughly
**80%**. I left it out because crossing a size is precisely the line the «نبشی
لقمه ۱۰» incident drew: a 100mm angle and a 100 spacer share every published
field except the one that matters, and the +121% write passed every confidence
gate. Crossing a *mill* is a claim the source can corroborate (do the other
mills agree?); crossing a *size* is a claim nothing on the page supports.

Some of those 58 are worth a second look as **catalogue** questions rather than
matcher ones — ورق گالوانیزه ۴/۵/۶mm is thicker than galvanised coil is
normally rolled, and لوله مبلی above 2″ is unusual. It may be that a few of
those SKUs should not be active.

**Per-شاخه → per-kg conversion would close 15 more** (تیرآهن, تیرآهن سبک). It
needs `theoretical_weight_kg`, which the mirror has refused to build on since
the first audit — and per the memory note that column was wrong on 185 SKUs and
is now written only when both the section table and the branch length are
published. I left the refusal in place.

---

## 7. What needs your judgement

### 7.1 Deploy first
`docker inspect ahantime-web-1` → `d2088f95`; `origin/main` → `62539ad`, 40
commits ahead. PR #243 is merged and not live. **+71 SKUs for free.**

### 7.2 The two catalogue problems from the prior report — both resolved, one reclassified

* **لوله مسی triplication is gone.** The prior report saw «۱/۲ اینچ بابک» at
  three prices. Today there are exactly 15 SKUs — 5 sizes × 3 mills — each
  with `grade = 'ضخامت ۰.۸۱'`, one row per pair. Nothing to fix.
* **لوله استیل's "~2× internal disagreement" was never a bug.** 14 of the 15
  are 316L at 1.70–1.85M and one (۵ اینچ) is 304 at 906,284. Different alloys,
  correctly ~2× apart, and PR #243's `grade` mapping now matches all 15
  exactly. **The real question is a stocking one:** is ۵ اینچ the only size you
  sell in 304, or should the 304/316L split run across the range?

### 7.3 Three catalogue rows that look wrong

| SKU | Issue |
|---|---|
| **وال پست ۱۵×۲۰** | Stored 127,530. Our own ladder puts ۱۵×۲۰ 17.6% above ۱۰×۲۰; ahanonline's puts it **41%** above. Every other وال پست SKU sits a uniform 5.0% under their row; this one sits 26% under. Our number looks wrong, not theirs — but it is the one write in 565 that moves a price >25%, so it should be a decision, not a side effect. |
| **ورق کرکره ۰.۵ روی اندود** | `factory` is null, so it skips as `sku-has-no-factory`. «روی اندود» is in the name and ahanonline publishes a group by that name. Setting `factory = 'روی اندود'` closes it. |
| **ورق پانچ سیاه ۲ فولاد مبارکه** | Their two rows differ only by ابعاد (1000×2000 vs 1250×2500, 55% apart) and our SKU records no ابعاد. Filling `dimensions` closes it; it is 1 SKU. |

### 7.4 The alloy/رده question from the brief — already answered, by PR #243

The brief asked whether the alloy for میلگرد استیل (32), لوله استیل (15) and
سیم‌مفتول/سیم‌جوش استیل (8) could be determined. **It already is, and it always
was:** `skus.grade` holds 304 / 304L / 310S / 316L on all of them. PR #243 read
it. All 55 now match exactly. No data migration is needed and none should be
proposed — the prior report's "our SKU names carry a country instead of the
alloy" was true of the *names* and false of the *catalogue*.

### 7.5 Should the public price row say «تخمینی»?

`current_prices.price_is_estimated` is populated but **not surfaced publicly**.
`toPriceRow` is shared between the public catalogue and the admin, so showing
it is a decision about what ahantime.com asserts to a customer, not a matcher
change. 35 SKUs are affected today. The data is in place the moment you decide.

My read: the AI advisor is grounded on these numbers and the whole product
promise is «اول مشورت، بعد خرید» with transparent prices. An estimate a
salesperson can see and a customer cannot is defensible — the human closes the
sale — but only if the panel is actually being read. If it is not, surface it.

### 7.6 Diminishing returns, plainly

565/782 is where honest automation gets to today. The next 58 need a rule that
crosses sizes; the 57 after that need a source that does not exist. Getting to
100% from here means inventing numbers, and on a site whose entire
differentiator is that its prices are real, that trade is not worth making.
What *would* move it further, in order of value per unit of risk:

1. Deploy (+71, free, already reviewed).
2. Re-run the sitemap diff on a schedule — twice now the gap has been a stale
   page list, not a missing source. §8.6 of the survey doc has the three steps.
3. Audit the 58 `no-size-match` SKUs as a catalogue question. Several look like
   sizes we should not be listing.

---

## 8. Gates

`tsc --noEmit` clean on every touched file across all four branches — the three
`ahantime-logo.png` import errors are pre-existing and present on `main`.
`next lint` clean. **101 tests pass** across `priceSync.match.test.ts` (69,
against 46 on `main` — 23 new), `markazeahan.test.ts` (12, all new),
`ahanonline.test.ts`, `priceSync.service.pg.test.ts` and
`pricing.adminGrid.pg.test.ts`. Per the project rule the full vitest suite and
`next build` were **not** run on this production box; CI runs them.

One environment note for whoever picks this up: `docker run` on this host
started failing mid-session with `failed to create TTRPC connection:
unsupported protocol: Yunix` for **new** containers (running ones are fine),
so the CLAUDE.md recipe for tooling is currently broken. There is a working
`node` v22 on the host PATH now, which is what the gates above were run with.

Three pre-existing tests were updated rather than deleted, each because this
work changed the contract they asserted, and each rewritten to guard the same
invariant against the new one: "lines the competitor does not sell" now names
the aluminium shells; the two `notPerKgSku` cases now assert that a per-kg row
still cannot price a per-شاخه SKU (the no-conversion rule, unchanged) rather
than that those bases are unmirrorable; and the "mapped but never fetched"
invariant now spans both sources' target lists.
