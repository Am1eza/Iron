# AGENT_REPORT — closing the price-coverage gap (US-05.3 / US-05.4)

**Date:** 1405/06/01 · 2026-08-23
**Branches:** `price-sync-stainless-grade` · `admin-price-age-view`
**Both branched off `main@d2088f9`, both left open for review. Neither merged.**

---

## The headline

The brief asked for two things and one of them turned out not to need doing.

**Part 1 was not a data-entry job.** The multi-source survey concluded that
میلگرد/لوله/سیم‌مفتول/سیم‌جوش استیل could not be mirrored because «our SKU names
carry a country (هند/تایوان/چین) and no alloy», and proposed renaming 73 SKUs to
put the alloy into the name. That was true of the **names** and false of the
**catalogue**: `skus.grade` already holds 304 / 304L / 310S / 316L on all 55
stainless SKUs. The matcher never selected the column. Reading it unlocks
**67 of 78** in-scope SKUs across **seven** product lines, and **no SKU data was
changed at all** — the dry-run script found nothing to change, which is a better
outcome than the rename it was written to propose.

**Part 2 was the real gap.** `stalenessJob` has been recomputing
`current_prices.is_stale` every ten minutes since it was written, and nothing
reads the column. The grid's «فقط کهنه‌ها» filter computes the same thing live
and, on production today, selects **624 of 975** price rows — a flag that fires
on two thirds of the catalogue tells an operator nothing. `/admin/pricing` now
carries a real age column, a selective threshold, and a catalogue-wide count.

---

## Coverage, before and after

Live figures from the production DB on 2026-08-23 21:00 UTC.

### Catalogue state

| | Active SKUs | With a price row | Never priced |
|---|---:|---:|---:|
| | 782 | 697 | 85 |

Age distribution of the 552 price rows on active SKUs under an active
sub-category — bimodal, because the mirror wrote half the catalogue this morning
and the rest was last touched in a bulk pass:

| Age | Rows |
|---:|---:|
| 0 days | 262 |
| 3 days | 248 |
| 4 days | 42 |

### Matcher coverage

|  | In scope for the mirror | Writes |
|---|---:|---:|
| Before (`main@d2088f9`) | 607 | 351 (last live run) |
| After, the 7 new families alone | +78 | **+67** |

Full-catalogue dry run on the branch: **211 writes, of which 0 move a stored
price by more than 5%.** (The run also hit two `body too short (3341 bytes)`
rate-limit blocks on the two میلگرد pages — a transient ahanonline response, not
a regression; the targeted run below fetched everything cleanly.)

---

## Part 1 — the استیل lines

### How each alloy was confirmed, not guessed

The `grade` column was **not** taken on trust. Every page was fetched live on
1405/06/01 and parsed with the production `parseAhanonlinePage`, and the check
was: does the price we already store equal the price ahanonline publishes for
**that alloy**?

| Our SKU | `grade` | Our stored price | Their row | Their price |
|---|---|---:|---|---:|
| میلگرد استیل ۱۲ هند | 304L | 831,818 | `میلگرد-استیل` `standard=304L` size 12 | 831,818 |
| میلگرد استیل ۱۲ چین | 316L | 1,218,181 | same page, `standard=316L` | 1,218,182 |
| میلگرد استیل ۱۲ تایوان | 310S | 1,919,090 | same page, `standard=310S` | 1,919,091 |
| میلگرد استیل ۶ تایوان | 310S | 1,939,090 | same page, size 6 | 1,939,091 |
| میلگرد استیل ۱۲۰ هند | 316L | 1,309,090 | same page, size 120 | 1,309,091 |
| لوله استیل ۵ اینچ | 304 | 906,284 | `لوله-استیل-صنعتی` `آلیاژ=304` | 896,545 / 916,023 (median 906,284) |
| لوله استیل ۳ اینچ | 316L | 1,700,000 | same page, `آلیاژ=316L` | 1,700,000 |
| نبشی استیل ۴۰×۴۰ | 304 | 850,909 | `نبشی-استیل` `آلیاژ=304` | 850,909 |
| ناودانی استیل ۱۰ | 304L | 909,090 | `ناودانی-استیل` `آلیاژ=304L` | 909,091 |
| پروفیل استیل ۳۰×۲۰ | 304 | 840,175 | `پروفیل-استیل` `آلیاژ=304` | 840,175 |
| سیم‌جوش استیل ۳ | 316L | 1,354,545 | `سیم-جوش-استیل` `آلیاژ=316L` | 1,354,545 |
| سیم‌مفتول استیل ۳ | 316L | 1,237,354 | `سیم-مفتول-استیل` `آلیاژ=316L` | 1,237,355 |

Agreement to the rial across three different alloys at three price tiers 2.3×
apart is not a coincidence: these SKUs were hand-seeded from these very pages,
and the seeder put the alloy in `grade` while the namer put the country in
`name`. The prices independently confirm the column.

The **dry run over all 78 in-scope SKUs reproduced every one of the 67 stored
prices to within 1 توман** (`+0.00%` on every line; the 1-Toman deltas are their
own display rounding). A mapping that reproduces the existing catalogue exactly
is the strongest evidence available that it is right rather than merely
permissive.

### Which SKUs got unlocked

| Family | Writes / in scope |
|---|---:|
| `rebar/stainless` — میلگرد استیل | 30 / 32 |
| `steel/pipe` — لوله استیل | 14 / 15 |
| `steel/channel` — ناودانی استیل | 6 / 6 |
| `steel/profile` — پروفیل استیل | 5 / 12 |
| `steel/angle` — نبشی استیل | 4 / 5 |
| `wire/welding-wire` — سیم‌جوش استیل | 4 / 4 |
| `wire/wire-rod` — سیم‌مفتول استیل | 4 / 4 |
| **Total** | **67 / 78** |

### The 11 that still skip, and why

**9 × `skip:no-size-match` — they do not list the size.** پروفیل استیل ۶۰×۶۰,
۸۰×۸۰, ۱۰۰×۱۰۰, ۴۰×۶۰, ۵۰×۱۰۰, ۲۰×۴۰, ۲۵×۵۰ (their table carries 7 rows, none
of them these); نبشی استیل ۲۰×۲۰; میلگرد استیل ۵.

**2 × `skip:variant-not-stocked` — a NEW reason code added here.** میلگرد ۶ is
310S-only on their table and our SKU is 304L; لوله ۲½ اینچ is 304-only and ours
is 316L. Under the existing `skip:sku-missing-variant` the admin panel would
have told the operator «آلیاژ/نوع این کالا در نام آن ثبت نشده» — go and fill in
a field that already holds the right value. It now says «منبع این سایز را در
این آلیاژ ندارد».

### What was NOT done, deliberately

- **No SKU renamed, no `grade` written.** The alloy was already correct on all
  55 rows. Nothing was fabricated and nothing needed to be.
- **`رده` (schedule 10/40/80) for لوله استیل was not invented.** Our SKUs do not
  carry it and there is no column for it. It turns out not to matter for 12 of
  the 15: every رده at a given (size, alloy) carries one price on their table.
  For ۲ اینچ 316L they differ (1,700,000 at رده 40, 1,800,000 at رده 10) and the
  existing 8% `maxCandidateSpreadPct` gate lets the median through at 1,750,000
  — which is exactly what we already store. Where رده genuinely could not be
  determined, nothing was guessed.
- **No ninth source was sought.** As instructed, and the survey's conclusion
  stands.

### Also fixed on the way

- **`INCH_KEYS`** — `INCH_CATEGORIES` is keyed on the *category* slug and لوله
  استیل sits under `steel`, not `pipe`. Without this, «۲½ اینچ» fell through to
  the generic "first number agrees" rule, where ۲½ and ۲ are the same product.
- **`STRICT_DIM_KEYS`** for نبشی/پروفیل استیل — their table carries 30\*20 and
  30\*30 at different prices, so a shared first number must not be enough.
- **Per-family `PRICE_BANDS`** — every stainless price is above the global
  500,000 carbon-steel ceiling. Without a band each correct match above would
  have been thrown away as `price-out-of-band`.
- **The `grade` identity mode demands EQUALITY, not the `name` mode's token
  containment.** «304» is a substring of «304L» and a different alloy at a
  different price (886,806 vs 831,818 T/kg on their own tables today).

---

## Part 2 — categories that are structurally un-mirrorable

Confirmed against the live pages, and left alone rather than forced:

| Line | Active SKUs | Why it will never auto-sync |
|---|---:|---|
| لوله مسی | 15 | `price_basis = 'coil'`; no source publishes a per-coil price. Also holds 3 duplicate rows per (size, mill) at different prices — mirroring would write one price onto all three and hide the duplication. |
| تسمه مسی | 18 | Their table publishes **one** price for 18 different sections with no unit column. Un-mirrorable at any confidence. |
| ساندویچ پانل | 4 | `sqm` basis, free-text «نام کالا» sizes, no stable identity to key on. |
| گریتینگ | 1 | Same. |
| وال پست | 8 | `price_basis = 'branch'`; source publishes no matching unit, and converting would require `theoretical_weight_kg`, which is unverified seed data. |
| میلگرد/لوله/نبشی/ناودانی/پروفیل آلومینیوم | 89 | ahanonline's aluminium rebar/pipe/angle/profile pages resolve but publish **0 priced rows** — SEO shells. Verified, and deliberately not mapped: mapping them would only manufacture a «page failed» line every run. |

These add up to ~135 SKUs that no amount of matcher work will reach. That is the
whole reason Part 2 exists: the responsible answer is not a forced match, it is
making sure a person sees them on a cadence.

---

## Part 2 — the staleness view

### The threshold decision, and what was deliberately not changed

There were two candidate definitions and they answer different questions:

| | `isStale` (existing) | `needsReview` (new) |
|---|---|---|
| Means | not priced during the current Jalali day | untouched for 5+ days |
| Audience | **customers** — «کهنه» badge on the public catalogue, and the AI advisor quotes the price with its date | **admins** — a work queue |
| Fires on (production, today) | **624 of 975** price rows | 0 |

**The customer-facing definition was left exactly as it is.** It is correct for
what it does: a customer deserves to know a number was last confirmed yesterday
even when yesterday's number is still right. Repointing it at a 5-day window
would change what the public site shows and what the advisor says — a product
decision, and not one to make from an admin screen. `stalenessJob` is likewise
untouched; the column it writes remains unread by anything, which is a separate
cleanup, not this one.

**5 days**, for two reasons that agree:

1. The Iranian working week is Saturday–Wednesday. Five days is one of them, so
   «needs review» means *this survived a whole working week with nobody and
   nothing touching it* — a real failure of the pricing routine, not a quiet
   stretch.
2. It sits above the mirror's rhythm (08:00 and 12:00 daily) and below
   `PRICE_STALE_HIDE_AFTER_DAYS`, the point at which the public site withholds
   the number entirely. By the hide threshold the damage is done; this one is
   meant to be crossed first.

### What was built

- **`عمر قیمت` column** — days since `current_prices.updated_at`, «امروز» when
  fresh, a `loss`-tone badge past the threshold, «—» for a never-priced product.
- **Sortable**, tri-state: oldest → newest → back to catalogue order, with
  `aria-sort` on the `<th>` and a screen-reader description of the next action.
- **«نیازمند بازبینی (N)» filter chip**, deep-linkable as `?review=1`.
- **`.rowAged` row tint**, ranked below every edit state so it never paints over
  feedback for what the operator just typed.
- **Catalogue-wide summary** above the table: «N قیمت در کل کاتالوگ بیش از ۵ روز
  است به‌روز نشده…», with a link into the current category's subset — scoped to
  the whole catalogue on purpose, because the lines that go untouched longest
  (لوله مسی, تسمه مسی) are exactly the ones nobody navigates to.
- **`pricesNeedingReview`** on `/api/admin/stats`, behind the same
  `pricing:write` permission as the other pricing tiles.

### Two bugs the live data caught

Both were found by running the real page against the production DB, not by
reading the code:

1. **`pricesNeedingReview` reported 1 that the grid could reach 0 of.** It
   counted bare `current_prices`; the one 47-day-old row was «میلگرد آجدار ۱۰»,
   whose SKU had been **deactivated** — a price row outlives its product. Now
   scoped to active SKUs under an active sub-category, exactly what the grid
   lists. A work-queue number nobody can act on is worse than no number.
2. **A never-priced product leaked into the review queue.** It still arrives
   with an `updatedAt` (the admin DTO's default), so the filter's first render
   offered «میلگرد آجدار ۱۲ آناهیتا گیلان» — never priced in its life — as a
   price that had gone stale. Never-priced is already its own queue, with its
   own explanation of why the mirror declines to guess.

### It rendering real data

`/admin/pricing` served from the branch against the **production database**.
Screenshot: `staleness-view.png` (in the `admin-price-age-view` branch root).

Because today's real queue is 0 — the 42 rows at 4 days cross the threshold
tomorrow — the capture advances the **browser clock** by two days. Age is
computed client-side from each row's real `updated_at`, so every product, price
and date below is live production data; only "now" is shifted. The catalogue-wide
banner is absent in the capture for the same reason: the server count is computed
server-side and correctly reads 0 today.

```html
<tr class="adminUi_rowAged__kDIlN">
  <td>میلگرد آجدار ۱۰ ابرکوه</td>
  <td class="tnum">۱۰</td>
  <td>ابرکوه</td>
  <td><input class="adminUi_numInput__NW_Pw" value="۷۰,۱۸۱" aria-label="قیمت میلگرد آجدار ۱۰ ابرکوه"></td>
  <td><input class="adminUi_textCell__D3KGM" value="۲۴ ساعت"></td>
  <td>—</td>
  <td><button class="adminUi_sparkButton__qtRKw" aria-label="تاریخچهٔ قیمت میلگرد آجدار ۱۰ ابرکوه">…</button></td>
  <td class="tnum"><span class="Badge_badge__V4FiA Badge_loss__YqaH0">۶ روز</span></td>
  <td><span class="Badge_badge__V4FiA Badge_loss__YqaH0">مخفی</span>
      <div class="adminUi_tileHint__7Q1Br">۱۴۰۵/۰۵/۲۸</div></td>
</tr>
```

Header, with the sort applied:

```html
<th scope="col" aria-sort="descending">
  <button type="button" class="adminUi_sortButton__…">
    عمر قیمت<span aria-hidden="true"> ↓</span>
    <span class="visually-hidden"> — مرتب‌شده از قدیمی‌ترین؛ برای مرتب‌سازی از تازه‌ترین فعال کنید</span>
  </button>
</th>
```

Observed live: chip reads «نیازمند بازبینی (۳۵)», the filtered table holds
exactly 35 rows, sorting puts the ۶ روز rows above the ۵ روز rows, and the
never-priced row is correctly absent from both.

---

## Gates

| | `price-sync-stainless-grade` | `admin-price-age-view` |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| `next lint` (touched files) | clean | clean |
| `stylelint` | n/a | clean |
| Targeted vitest | 46 pass (6 new) | 35 pass (11 new) |

The three pre-existing `ahantime-logo.png` import errors are present on `main`
and unrelated. Per the brief the full vitest suite was **not** run on this box
(past OOM); CI will.

---

## Follow-ups worth doing, not done here

- **`current_prices.is_stale` is dead weight.** `stalenessJob` writes it every
  ten minutes and every reader computes freshness live instead. Either delete
  the column and the job or point something at it — but that is a separate
  change with its own migration.
- **The 85 never-priced SKUs** are surfaced correctly by PR #230 and untouched
  here, as instructed.
- **لوله استیل holds duplicates** at 886,805 and 1,700,000 for the same size —
  which this work explains: they are 304 and 316L, not a data error. Worth
  confirming with the owner that both are meant to be listed.
- **Re-diff `AHANONLINE_TARGETS` against their sitemap periodically.** Their
  sitemap now lists 352 `/product-category/` pages; we map 55.
