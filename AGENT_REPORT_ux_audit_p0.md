# P0 UX audit — fix report

Continuation of a job that started directly on the production VPS and was
moved to a local Mac checkout (`/Users/amirreza/Iron`) after the VPS became
overloaded from too many concurrent agent jobs. Everything below was done
against a locally seeded Postgres DB (`pnpm db:migrate && pnpm db:seed`) and
a local `pnpm dev` server — no production server was touched.

Base commit for every branch: `main@59a0e9e`, except the compare-UX PR which
is stacked on `perf/price-table-single-dom` (#250, per the brief's
instruction to build on the single-DOM table rather than redo it).

## What was fixed

### 1. Fixed-position UI collision + route exclusion — PR #255 (`ux-p0-audit` → `main`)
Finished and verified work that was already in progress on the branch.
- `ArrivalPopup` and `CallbackWidget` («تماس بگیرید» FAB) both used the same
  `inset-block-end` offset — collided on mobile with each other and with the
  toast region. Split into three stacked "floating lanes" in `tokens.css`.
- `ArrivalPopup` now suppresses itself by route (`arrivalPopupRoutes.ts`:
  `/cart`, `/request`, `/login`, `/account`, `/club`, `/ai`, `/admin`,
  `/panel-login`) and the 12s reveal timer isn't even scheduled there.
- New `useAnyModalOpen()` (derived from the existing `useFocusTrap` hook, so
  it can't drift from what's actually modal) hides the popup while any real
  dialog is open — including the price-compare modal.
- Evidence: `ArrivalPopup.test.tsx` 7/7. Live: mobile viewport (390×844) on
  `/prices/rebar` shows no overlap between popup/FAB/toast; popup does not
  appear on `/login` after 14s; popup hides while the compare modal is open
  and reappears when it closes.

### 2/3/7. Compare-selection feedback, diff highlighting, touch targets — PR #258 (`compare-ux-feedback` → `perf/price-table-single-dom`)
- Selecting exactly one product now shows «حداقل دو محصول برای مقایسه
  انتخاب کنید — یک مورد دیگر را هم علامت بزنید.» (`role="status"`) instead
  of a silently-disabled button.
- The 2–4-product compare modal highlights rows where the selected products'
  values actually differ (size, dimensions, factory/region, weight, price,
  movement, delivery) with a tinted background, and offers a next action —
  «افزودن گزینهٔ ارزان‌تر (نام) به سبد» — when a genuine price difference
  exists among visibly-priced selections.
- Compare checkbox (~13×13px) wrapped in a 44×44px padded tap target without
  changing its visual size; the «پرش سریع به کارخانه» quick-jump chips
  (~30px tall) now have `min-block-size: 44px`.
- ArrivalPopup-over-modal suppression from #255 covers this modal too, once
  both PRs are merged — no extra code needed here.
- **Caveat**: `perf/price-table-single-dom` has a pre-existing SSR/client
  hydration mismatch on `/prices/[category]`, reproduced on a clean checkout
  of that branch before any change of mine. It doesn't block functionality
  but makes live-browser verification unreliable, so this PR's logic is
  verified with `PriceTable.compareUx.test.tsx` (jsdom, no SSR involved)
  rather than the dev server. Flagged in the PR for the owner; not fixed
  here since it's #250's code, not mine.
- Evidence: `PriceTable.compareUx.test.tsx` 5/5 (new) + 139/139 pre-existing
  `src/components/catalog/` tests.

### 4. Login-required warning before checkout redirect — PR #260 (`login-warning-cart` → `main`)
- Cart CTA now reads «ورود و ادامه ثبت درخواست» for a signed-out visitor
  (unchanged for one already authenticated), via `useAuth().isAuthenticated`.
- Login page shows a reassurance alert when arrived via `next=/request`:
  «سبد استعلام شما نگه‌داشته شده؛ پس از تأیید شماره، به ثبت درخواست
  بازمی‌گردید.» New `auth.requestFlowNote` key, translated in all four
  locale catalogues (fa/en/ar/zh), covered by the existing key-parity test.
- Club-popup suppression on `/login` (audit called this out by name) was
  already covered by fix #1's route list — confirmed live, not re-done.
- Evidence: `CartView.test.tsx` (2, new), `LoginForm.test.tsx` (3, new).
  Live: guest → cart → CTA text correct → `/request` → redirected to
  `/login?next=%2Frequest` → reassurance alert rendered.

### 5. kg-priced product cart quantity — PR #262 (`cart-qty-kg-products` → `main`)
- New `KgQuantityModal` (lazy-loaded): defaults to **one شاخه's worth**
  (`theoreticalWeightKg`) when the SKU has a recorded branch weight, with a
  stepper for branch count and a toggle to direct-kg entry; when the SKU has
  no recorded branch weight, direct-kg entry is the only mode and confirm
  stays disabled until a weight is typed (no silent 0 or 1kg default).
- Wired into both add-to-cart entry points: `PriceTable`'s per-row button
  and `SkuDetail`'s CTA. Non-kg bases (شاخه/برگ/عدد/…) verified unchanged —
  `qty: 1` there already means one real unit.
- Evidence: `KgQuantityModal.test.tsx` (4), `PriceTable.kgQuantity.test.tsx`
  (3), `SkuDetail.kgQuantity.test.tsx` (3) — all new, 149/149 across
  `src/components/catalog/` + `src/components/cart/`. Live: SKU page for a
  7.4kg-branch rebar product opens the modal defaulting to «۷.۴ کیلوگرم»;
  confirming adds exactly that line to the cart (checked in `/cart`).
- **Note for the owner**: this PR's `PriceTable.tsx` diff targets the
  current (pre-#250) dual desktop/card DOM, same file #250/#258 also touch.
  Small and additive (one new gate + one new component) — should rebase
  cleanly onto #250 either order, but sequencing is worth a look when
  merging all of these.

### 6. Factory-comparison tool context — **skipped, already fixed**
Verified PR #245 (`fix/price-basis-accuracy`, sibling `audit-price-accuracy`
job) already seeds `BulkQuote`'s `defaultSub`/`defaultSize` from the SKU
page's own row (`SkuDetail.tsx` → `<BulkQuote defaultSub={row.subCategoryId}
defaultSize={row.size} .../>`), with a regression test showing 193/193 rows
correctly scoped to the SKU's own sub-category. No duplicate work done.

### 8. 404 page icon + real search — PR #264 (`fix-404-page` → `main`)
- New `SearchOffIcon` (magnifying glass + × in the lens) replaces the
  default `EmptyState` glyph (`IBeamGlyph`, a steel I-beam that reads as a
  capital "I"/cursor out of catalog context) **on this page only** — the
  shared default is untouched everywhere else it's used.
- Reused the existing `SearchBar` component (`size="lg"`, autoFocus),
  wired to the real `/search?q=` route, under the empty-state block.
- Evidence: `not-found.test.tsx` (3, new). Live: bad URL → HTTP 404, new
  icon renders, typed «میلگرد» + submit → navigated to `/search?q=میلگرد`.

## Hero video pause control — out of scope, as instructed
Left untouched per the owner's explicit exclusion (see `HeroVideo.tsx`'s
own comment: a prior reduced-motion attempt caused a flash bug and was
reverted 2026-08-14).

## What I could not fully verify
- **PR #258's compare-modal visuals** — see the hydration-mismatch caveat
  above. Logic is verified by test, not by trusting the live dev server on
  that branch.
- **CI status at hand-off**: `Workers Builds: ahantime` is red on every PR —
  confirmed pre-existing/independent of any of these changes per
  `CLAUDE.md`. `checks` fails on PRs based on plain `main` with the exact
  `scripts/repairSeedPrices.ts` typecheck error tracked by the still-open
  PR #249 — not caused by this work. PR #258 (based on #250) additionally
  saw one e2e failure in `e2e/auth.spec.ts` (OTP flow, a file none of this
  work touches) and PR #262 saw one unit-test failure in
  `src/lib/auth/service.test.ts` (also untouched) — both read as flakes
  given the number of PRs/CI runs firing concurrently around the same
  commit; not chased down further, see `UX_P0_AUDIT_FINAL_SUMMARY.md` for
  exact run links.

## Choices left for the owner's judgment
- Exact Persian copy wording throughout (hint text, CTA labels, alert copy)
  — written to match the site's existing tone, but is exactly the kind of
  thing a native-speaking human reviewer should sign off on.
- PR merge order/sequencing given the `PriceTable.tsx` overlap between
  #250 (perf), #258 (compare-UX, stacked on #250) and #262 (kg-quantity,
  based on plain `main`).
- The `perf/price-table-single-dom` hydration bug (#250) — flagged, not
  fixed, since it's a sibling PR's own code.
