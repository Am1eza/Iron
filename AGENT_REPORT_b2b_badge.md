# AGENT_REPORT — surface business-account verification as a visible benefit

**Branch:** `worktree-b2b-badge` · **Scope:** UI + copy only. No schema change, no new
column, no migration, no pricing logic.

## What already existed (unchanged)

`users.company_name` / `company_national_id` / `economic_code` / `biz_verify_status`,
`POST /api/me/verification`, `VerificationCard`, `VerificationReview`, `verificationRepo`.
A customer could already submit company details and be admin-approved to level 3. What was
missing was any sign of it afterwards — the approval was invisible to both the customer and
the sales rep.

## What was added

| # | File | Change |
|---|---|---|
| 1 | `web/src/lib/data/verification.ts` | New exported constant `BUSINESS_ACCOUNT_LABEL = 'حساب سازمانی تأییدشده'` — one string, three surfaces. Rewrote the level-3 `unlocks` list (see "copy" below). |
| 2 | `web/src/components/account/BusinessAccountBadge.tsx` (new) | The badge itself: `Badge tone="success"` + `ShieldIcon`, showing `«حساب سازمانی تأییدشده · <نام شرکت>»` when the company name is known, the bare label otherwise. |
| 3 | `web/src/app/account/[[...tab]]/page.tsx` | Account page **header**: renders the badge next to the role badge when `bizVerifyStatus === 'approved'`. The session token has no verification state, so the header does one PK-indexed `getUserProfile` in live mode. |
| 4 | `web/src/components/account/VerificationCard.tsx` + `.module.css` | The level-3 "maxed" state was one grey sentence and a `بالاترین سطح احراز` badge. It is now the business badge (with the company name) plus a one-line note saying the sales rep sees this when reviewing an inquiry. New optional prop `verifiedCompanyName` (named to avoid colliding with the existing `companyName` form-state in the same component). |
| 5 | `web/src/app/api/admin/leads/[id]/route.ts` | `GET` now also returns `customer: { companyName, bizVerified: true } \| null` — one extra indexed select, only when `lead.userId` is non-null, and `null` unless the account is `approved`. |
| 6 | `web/src/lib/api/resources/admin.ts` | Typed that new `customer` field on `adminApi.lead`. |
| 7 | `web/src/components/admin/leads/LeadDetail.tsx` | Sales side: the same badge in the lead's identity header, next to «شمارهٔ تأییدشده». |
| 8 | `web/src/lib/data/verification.test.ts` (new) | Guard test: **no level's copy may contain** تخفیف / درصد / عمده‌فروشی / اعتباری / قیمت ویژه / ارزان. |
| 9 | `web/src/components/account/BusinessAccountBadge.test.tsx` (new) | Badge renders with and without a company name (blank/whitespace falls back). |

## Copy: the honest "why verify"

The brief asked for a concrete reason to verify. Two of the claims it suggested turned out
**not** to be backed by code, so neither was used:

- **"Higher priority handling"** — there is no priority score anywhere. `verificationRepo.ts`
  has no scoring at all; the only thing `bizVerifyStatus` feeds is `clubPoints.ts`
  (`level3: 3` points vs `level2: 2`). Not claimed.
- **"Your company appears on the official پیش‌فاکتور"** — the proforma letterhead
  (`club_memberships.letterhead_*`) is gated on **club tier `poolad`**, not on business
  verification (`src/app/proforma/[ref]/page.tsx:50`), and the proforma does not print the
  verified company as the buyer at all. The link is only indirect (level 3 → +3 club points
  → helps reach پولادی). Too weak to state as a benefit; not claimed.

I also **removed two pre-existing false claims** from the level-3 list, because making the
badge visible would have amplified them:

- `قیمت و شرایط عمده‌فروشی` (wholesale pricing/terms) — no tier-pricing mechanism exists.
- `امکان خرید اعتباری` (credit purchase) — no credit limit exists anywhere in the codebase.

The level-3 list now reads (each line backed by real behaviour):

1. `نشان «حساب سازمانی تأییدشده» روی حساب شما` — items 2–4 above.
2. `کارشناس فروش هنگام استعلام می‌بیند که کسب‌وکار شما تأییدشده است` — items 5–7 above.
3. `مشخصات شرکت برای صدور فاکتور رسمی شرکتی ثبت و آمادهٔ استفاده است` — the identifiers are
   stored and approved; the invoice itself is the existing human/offline process.
4. `بیشترین امتیاز احراز در باشگاه مشتریان` — `clubPoints.ts` `level3: 3`.

## Explicit confirmation: no pricing or discount claim was introduced

**No file in this change adds, implies or hints at a price, discount, percentage, volume
tier or credit facility.** The net effect on money-related copy is *negative*: two unbacked
claims were deleted and none added. `verification.test.ts` now fails CI if any is
reintroduced. No pricing code, no `current_prices`, no proforma totals and no club weights
were touched.

## Verification run

- `tsc --noEmit` — clean apart from three pre-existing `*.png` module errors that appear in
  any fresh worktree (the gitignored generated `next-env.d.ts` is absent); unrelated to
  these files.
- `vitest run` on the three relevant test files — 12 passed (including the untouched
  `LeadDetail` suite, which still passes with the mock that omits `customer`).
- `next lint` on all seven touched source files — clean. `stylelint` on the touched CSS
  module — clean.
- Full `next build` in Docker — see the PR checks.

The full unit suite was deliberately **not** run on this host (past OOM); CI runs it.

## Out of scope (deliberately left alone)

- Level-2 copy still promises `سقف سفارش بالاتر`, which is also unimplemented — not a money
  claim, and out of this pass's scope.
- Any actual B2B pricing/discount tier. That needs the owner's numbers and is tracked
  separately.
