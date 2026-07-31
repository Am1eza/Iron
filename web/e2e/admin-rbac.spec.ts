import { test, expect } from '@playwright/test';

/**
 * RBAC scoping for the admin area — a `content` role (seed fixture
 * 09120000001, see seed.ts) must only see/reach what `content:write` and
 * `content:publish` grant it. Direct navigation to an unpermitted admin page
 * must 404 (hide, don't reveal — same contract as the API guards).
 *
 * ⚠️ KNOWN HARNESS BLOCKER (W26) — this file cannot currently pass, and that
 * predates the palette cases below. Two stale assumptions were found by
 * actually running it; the first is fixed here, the second is not fixable
 * from inside this file:
 *
 *  1. FIXED: `loginAs` read a 5-digit OTP out of the dev-code banner while
 *     CONSTANTS.OTP_LENGTH is 6. `{5}` still MATCHED (the first five
 *     characters), so `expect(code).toBeTruthy()` passed and the failure
 *     surfaced much later as «کد تأیید باید ۶ رقم باشد» on submit.
 *
 *  2. OPEN: middleware.ts hard-404s every `/admin/*` and `/api/admin/*` path
 *     unless `Host` is exactly `panel.ahantime.com` (the panel-host split —
 *     see lib/server/utils/panelHost.ts), and that gate is active because
 *     playwright.config.ts sets AUTH_ENFORCED=true. The suite drives
 *     127.0.0.1:3100, so the admin area is invisible to it. It cannot simply
 *     be pointed at the panel hostname either: `resolvePanelRouting` compares
 *     the raw Host header against a bare hostname, so `panel.ahantime.com:3100`
 *     does not match — the harness would need the panel on port 80, or the
 *     host comparison would need to ignore the port. That is a middleware /
 *     playwright-config decision, deliberately not taken here.
 *
 * Net effect today: this whole file is `test.fixme` until (2) is resolved.
 * Five cases fail outright. The sixth — the 404 test — "passes", but for the
 * WRONG reason: it sees a 404 because the panel-host gate 404s everything
 * under 127.0.0.1, not because RBAC denied a content role. A test that is
 * green for a reason unrelated to what it claims to assert is worse than a
 * red one, so it is marked too rather than left as false assurance.
 *
 * They are `fixme`, not `skip`, so they stay listed in every run as known-
 * broken work rather than quietly disappearing. The RBAC property these
 * cases describe IS asserted today, at the unit level, in
 * src/lib/auth/adminSearch.test.ts — that is what actually guards the
 * per-entity filtering right now.
 */
async function loginAs(page: import('@playwright/test').Page, mobile: string) {
  // `?next=` is load-bearing, not decoration. LoginForm only sends a staff
  // login to the dashboard on the panel.ahantime.com host — everywhere else
  // (including 127.0.0.1 under this suite) staff deliberately land on
  // /account like any other user, so a bare /login left every test here
  // waiting out `toHaveURL(/\/admin/)` on the account page. `next` is the
  // app's own supported override for exactly this.
  await page.goto('/login?next=/admin');
  await page.waitForLoadState('networkidle');
  const mobileField = page.getByLabel('شمارهٔ موبایل');
  const submitBtn = page.getByRole('button', { name: 'دریافت کد تأیید' });
  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  // The mobile field is a React-controlled input, and the form has no
  // `action`/`method` fallback — both the fill and the click depend on
  // hydration having attached React's handlers. Confirming the DOM value
  // right after `.fill()` is NOT enough: hydration can still commit *after*
  // that check passes, re-rendering the input from React's own (still-empty)
  // state and silently discarding the native fill before the click ever
  // reads it — surfacing later as a client validation error despite the
  // value looking right a moment earlier. So retry the WHOLE
  // fill+click+outcome sequence, not just the fill. This is safe to repeat:
  // a client-rejected or hydration-lost attempt never reaches the server
  // (no request is logged for it), and a genuinely in-flight real request
  // disables the submit button (`loading={submitting}`), making a retried
  // click on it a no-op rather than a second request.
  await expect(async () => {
    await mobileField.fill(mobile);
    await submitBtn.click();
    await expect(devCodeStatus).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  const text = await devCodeStatus.textContent();
  // SIX digits — CONSTANTS.OTP_LENGTH. See the same fix in auth.spec.ts: `{5}`
  // still matched (the first five characters of) a six-digit code, so this
  // drifted silently and left every test in this file failing at the submit.
  const code = text?.match(/[۰-۹0-9]{6}/)?.[0];
  expect(code).toBeTruthy();

  await page.getByRole('group', { name: 'کد تأیید پیامک‌شده' }).locator('input').first().pressSequentially(code!);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test.fixme('content-role nav only lists permitted sections', async ({ page }) => {
  await loginAs(page, '09120000001');
  // `toHaveURL` above only confirms the navigation committed, not that the
  // (cold-compiling, on a first hit) admin layout has actually painted its
  // nav yet — reading `allTextContents()` immediately can race a still-empty
  // DOM. Wait for at least one nav link before reading all of them.
  const nav = page.locator('nav[aria-label="پنل مدیریت"] a');
  await expect(nav.first()).toBeVisible();
  const navLabels = await nav.allTextContents();
  expect(navLabels).toContain('داشبورد');
  expect(navLabels).toContain('محتوا');
  expect(navLabels).not.toContain('قیمت‌گذاری');
  expect(navLabels).not.toContain('کاربران');
  expect(navLabels).not.toContain('تنظیمات');
  expect(navLabels).not.toContain('رویدادها');
  expect(navLabels).not.toContain('سرنخ‌ها');
  expect(navLabels).not.toContain('کاتالوگ');
});

test.fixme('content-role direct navigation to an unpermitted page 404s', async ({ page }) => {
  await loginAs(page, '09120000002');
  // Not asserting on the HTTP status code here: this app renders under a
  // root loading.tsx, which wraps every route in a Suspense boundary per
  // Next.js's file-system convention — and Next.js has a well-documented
  // limitation (https://github.com/vercel/next.js/issues/62228) where a
  // notFound() thrown below an active Suspense boundary locks in the 200
  // status streaming already started with, even though the not-found UI
  // renders correctly. The actual security property — the pricing page's
  // protected content never reaching the client — is what this asserts.
  await page.goto('/admin/pricing');
  await expect(page.getByText('این صفحه پیدا نشد')).toBeVisible();
  await expect(page.getByText('قیمت‌گذاری روزانه')).toHaveCount(0);
});

test.fixme('content-role can reach its own page', async ({ page }) => {
  await loginAs(page, '09120000003');
  const resp = await page.goto('/admin/content');
  expect(resp?.status()).toBe(200);
});

test.fixme('stats API only returns fields the role is permitted to see', async ({ page }) => {
  await loginAs(page, '09120000004');
  const stats = await page.evaluate(async () => {
    const r = await fetch('/api/admin/stats');
    return { status: r.status, body: await r.json() };
  });
  expect(stats.status).toBe(200);
  expect(stats.body.stats.draftArticles).not.toBeUndefined();
  expect(stats.body.stats.stalePrices).toBeUndefined();
  expect(stats.body.stats.totalUsers).toBeUndefined();
  expect(stats.body.stats.aiToday).toBeUndefined();
});

/* ----------------- command palette entity search (W26) ----------------- */

/** The lead seeded by src/lib/server/db/seed.ts purely for these two tests. */
const FIXTURE_LEAD_MOBILE = '09123334455';
const FIXTURE_LEAD_NAME = 'مشتری آزمایشی';

/** Opens the palette and types `q`, resolving with the search API's status.
 *  Waiting on the RESPONSE (not a timeout) is what makes the 200-vs-403
 *  distinction below assertable at all. */
async function paletteSearch(page: import('@playwright/test').Page, q: string): Promise<number> {
  await page.getByRole('button', { name: /جستجو در پنل/ }).click();
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  const responded = page.waitForResponse((r) => r.url().includes('/api/admin/search'));
  await input.fill(q);
  const res = await responded;
  // The rows render from the resolved query; give React the tick to commit.
  await expect(page.getByRole('listbox')).toBeVisible();
  return res.status();
}

test.fixme('palette: content role gets a 200 with zero lead rows, not a 403', async ({ page }) => {
  await loginAs(page, '09120000001');
  // The route is REACHABLE for any staff role (admin:access is the floor) —
  // it is the leads themselves that are filtered out, per entity type. A 403
  // here would mean the palette had been gated at leads:read, which would
  // also have broken this role's own article search.
  const status = await paletteSearch(page, FIXTURE_LEAD_MOBILE);
  expect(status).toBe(200);

  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.filter({ hasText: FIXTURE_LEAD_NAME })).toHaveCount(0);
  await expect(options.filter({ hasText: FIXTURE_LEAD_MOBILE })).toHaveCount(0);
  // Not even an empty «سرنخ‌ها» group heading: a zero-count group still
  // discloses that leads exist and that this query did or didn't match one.
  await expect(page.getByRole('listbox')).not.toContainText('سرنخ‌ها');
  await expect(page.getByText('چیزی پیدا نشد.')).toBeVisible();
});

test.fixme('palette: sales role sees leads but never users', async ({ page }) => {
  await loginAs(page, '09120000005');

  expect(await paletteSearch(page, FIXTURE_LEAD_MOBILE)).toBe(200);
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.filter({ hasText: FIXTURE_LEAD_NAME })).toHaveCount(1);

  // Same palette, same 200, a query that matches a real USER row (the
  // content-role fixture accounts) — and nothing comes back, because
  // `sales` holds no `users:manage`.
  await page.keyboard.press('Escape');
  expect(await paletteSearch(page, 'سردبیر محتوا')).toBe(200);
  await expect(page.getByRole('listbox')).not.toContainText('کاربران');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);
});
