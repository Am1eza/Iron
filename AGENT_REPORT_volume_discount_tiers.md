# تخفیف پلکانی — volume discount tiers

**Branch:** `feat/volume-discount-tiers` · **Story:** US-19.4 (proforma discounts)
**Status:** open for review. **Not** safe to auto-merge on green CI — see §6.

---

## 1. The numbers chosen, and why

The owner set the **structure** and delegated the exact percentages, stating a
range per band. The numbers shipped sit in the **lower half** of each range:

| Band | Persian label | Threshold (total order) | Owner's range | **Chosen** |
|---|---|---|---|---|
| `retail` | خرید خرد | زیر ۵ تن | — (base price) | **0%** |
| `bulk` | خرید عمده | ≥ ۵ تن | ۱–۲٪ | **1.5%** |
| `enterprise` | سازمانی / پروژه‌ای | ≥ ۲۰ تن **or** حساب سازمانی تأییدشده | ۲–۴٪ | **2.5%** |

Why the lower half rather than the midpoint or the top:

1. **A discount is far easier to raise than to lower.** 1.5% → 2% reads to a
   returning buyer as goodwill. 3% → 2% reads as a price hike on a number they
   have already been quoted and budgeted against. Start where there is room up.
2. **Distribution margin on steel here is single-digit percent of the ton
   price.** 2.5% off the invoice on a 20-ton order is already a material share
   of the gross margin on that order; 4% may not survive contact with the actual
   cost sheet — which only the owner has.
3. **The non-price benefits carry the top tier.** Priority proforma issuance,
   LC/credit support and a dedicated rep are the substantive part of the offer
   for a corporate buyer. Leaning on those keeps the headline percentage
   conservative without weakening the proposition.

### Boundary semantics (the off-by-one that costs money)

Thresholds are **inclusive lower bounds, in kilograms**:

```
totalWeightKg <  5,000  → retail      0%
totalWeightKg >= 5,000  → bulk        1.5%
totalWeightKg >= 20,000 → enterprise  2.5%
```

So **exactly 5 tons** gets bulk and **exactly 20 tons** gets enterprise. The
owner's wording («۵ تا ۲۰ تن» / «بالای ۲۰ تن») is ambiguous at exactly 20 tons;
it is resolved **in the customer's favour**, which is also the only reading
under which the three bands partition the range with no gap. Both boundaries are
pinned by tests.

### The verified-business arm

`users.biz_verify_status = 'approved'` — the same column and the same
comparison the `b2b-verified-badge` work (#239, now merged) surfaces — lifts a
buyer to `enterprise` **regardless of tonnage**. `'pending'` is deliberately not
approved: a submitted-but-unreviewed company registration must not buy a price
cut. The override is a **floor, not a cap** — it is implemented as "the better
of the two rates", so if the bands are ever retuned such that a high-tonnage
band beats the business floor, a verified buyer still keeps the better one.

---

## 2. Where the config lives (the one file to tune)

**`web/src/lib/config/pricingTiers.ts`** — the single place any threshold or
percentage exists. Retuning is a one-line edit to a `discountRate`; nothing else
in the codebase hardcodes a rate or a threshold.

It exports one pure function that decides everything:

```ts
resolveVolumeTier({ totalWeightKg, businessVerified }) → { tier, viaBusinessAccount }
volumeDiscountToman(subtotal, tier) → whole Toman, clamped to [0, subtotal]
volumeDiscountLabel(resolved)       → «تخفیف عمده (۱٫۵٪)» / «تخفیف حساب سازمانی (۲٫۵٪)»
```

No I/O, no framework. The **server** (`issueProforma`) and the **admin rep
preview** (`proformaTotals` in `LeadDetail.tsx`) both import the *same*
function, so the rate can never drift between the rep's screen and the
customer's document.

Hostile inputs are guarded across the whole numeric domain: negative, `NaN` and
`Infinity` tonnage all fall back to the base band. "We don't know" never buys a
discount.

---

## 3. Where tonnage comes from

A tier is a property of the **order**, not of a SKU, so it is decided from the
whole basket:

- `quotedWeightKg(lines)` in `leads.service.ts` sums `LineItem.weightKg` over the
  quoted lines. That field is already the **line's total mass with qty folded in**
  (`lineWeightKg` in `utils/priceMath`), so it is *not* multiplied by qty again.
- A line with **no known weight** (توافقی, or a per-piece SKU with no section
  table on file) contributes **0**, not a guess. Under-counting only ever costs a
  discount that was never promised; over-counting hands out money on invented
  tonnage.
- In the rep preview, tonnage is summed over the **priced lines only** — an
  unpriced line is not being quoted, so its weight must not buy a discount on
  the lines that are.

---

## 4. How it surfaces to the customer

Applied at **proforma issuance**, `issueProforma` in
`web/src/lib/server/services/leads.service.ts`. Two independent discounts now
come off `subtotal`, both **before VAT**:

1. **تخفیف پلکانی** — the rule-based band. **Not a caller input**: it is a
   published entitlement, so a rep can neither forget it nor hand it out early.
2. **`discountToman`** (the pre-existing US-19.4 manual per-deal figure) on top.

**Ordering is deliberate:** the tier discount is taken first and the manual one
is clamped into what is left. Without that, a fat-fingered manual discount would
silently swallow the tier the printed sheet still claims to grant. Their sum can
never exceed `subtotal`, so `taxable` never goes negative.

The customer's `/proforma/[ref]` sheet prints it as **its own line naming its own
reason and rate** — never folded into the unit price:

```
جمع کل                       ۱٬۵۸۶٬۳۶۰٬۰۰۰ تومان
تخفیف عمده (۲٫۵٪)            −۳۹٬۶۵۹٬۰۰۰ تومان
مبلغ مشمول مالیات            ۱٬۵۴۶٬۷۰۱٬۰۰۰ تومان
ارزش افزوده (۱۰٪)             ۱۵۴٬۶۷۰٬۱۰۰ تومان
مبلغ نهایی                   ۱٬۷۰۱٬۳۷۱٬۱۰۰ تومان
```

The same figures are on the public JSON at `/api/proforma/[ref]`
(`volumeDiscountToman`, `volumeDiscountLabel`, `volumeTier`) so a consumer can
reconcile subtotal/VAT/total, and in the admin lead-detail summary so the rep
sees the band before issuing.

**Persistence & audit.** Migration `0044_volume_discount_tiers.sql` adds four
columns to `proformas`, kept separate from the rep's manual `discount_toman`:

| column | why |
|---|---|
| `volume_discount_toman` | the tier's Toman amount, separate from rep discretion |
| `volume_tier` | which band earned it |
| `volume_discount_label` | the reason line **frozen at issuance** — a reprint of an old quote must keep the rate it was actually issued at, since the owner is expected to retune |
| `quoted_weight_kg` | the tonnage the band was decided from — the audit trail |

Two reasons for money coming off one invoice are two numbers: the sheet names
each, and the owner can later ask "what did the tier scheme cost us" without
that being tangled up with ad-hoc rep discretion.

---

## 5. Worked examples (run through the shipped functions)

Real live unit price: **نبشی بال مساوی ۸ @ ۷۹٬۳۱۸ تومان/کیلوگرم** (from
`current_prices`), VAT 10%.

| Order | Band | Line printed | Discount (T) | Total (T) |
|---|---|---|---|---|
| 4 t, unverified | retail | *(no row)* | 0 | ۳۴۸٬۹۹۹٬۲۰۰ |
| **exactly 5 t**, unverified | bulk | تخفیف عمده (۱٫۵٪) | ۵٬۹۴۸٬۸۵۰ | ۴۲۹٬۷۰۵٬۲۶۵ |
| **exactly 20 t**, unverified | enterprise | تخفیف عمده (۲٫۵٪) | ۳۹٬۶۵۹٬۰۰۰ | ۱٬۷۰۱٬۳۷۱٬۱۰۰ |
| 3 t, **verified business** | enterprise | تخفیف حساب سازمانی (۲٫۵٪) | ۵٬۹۴۸٬۸۵۰ | ۲۵۵٬۲۰۵٬۶۶۵ |

Note the last two rows: the label names *why* — tonnage vs. the verified
account — because a discount whose reason is invisible reads as an arbitrary
number.

---

## 6. What the owner must decide before merge

**This is a new revenue-affecting mechanism. Green CI says the arithmetic is
right; it says nothing about whether 1.5% and 2.5% are the right numbers.**

Please confirm before merging:

1. **The two percentages** (1.5% / 2.5%) against the real cost sheet. One-line
   edit in `pricingTiers.ts` — no engineering pass needed to change them.
2. **The thresholds** (5 t / 20 t) and that exactly-20-tons should land in the
   top band.
3. **That a verified business account gets 2.5% on *any* order size**, including
   a 500 kg one. That is the owner's own stated structure, but it is the arm
   with the least tonnage backing it.
4. **That the discount is stacked *under* the rep's manual discount** rather
   than replacing it — a rep can still add a per-deal figure on top of the tier.

## 7. Verification run

- `tsc --noEmit` — clean
- `vitest run` on the three touched test files — **53 passed** (22 new tier
  tests, 10 new service tests, 8 new preview tests), including every boundary:
  exactly 5 t, exactly 20 t, 1 kg under each, verified-but-small,
  unverified-but-large, pending-not-approved, oversized manual discount
- `next lint` on all touched files — clean
- Migration chain checked: `0044` follows `0043` with an intact `prevId`; no
  sibling migration was stranded
- Rebased onto `origin/main` **after** #239 merged, so the rep preview reads the
  real `customer.bizVerified` rather than assuming unverified

Base prices, `current_prices` and the price-sync mechanism are untouched. This
is strictly an additive discount layer at quote/proforma time.
