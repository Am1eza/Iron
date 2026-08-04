import { test, expect } from '@playwright/test';
import { BASE_URL, PANEL_BASE_URL } from '../playwright.config';

/**
 * RBAC scoping for the admin area — a `content` role (seed fixture
 * 09120000001, see seed.ts) must only see/reach what `content:write` and
 * `content:publish` grant it. Direct navigation to an unpermitted admin page
 * must 404 (hide, don't reveal — same contract as the API guards).
 *
 * ── W29: these were all `test.fixme`; the blocker is fixed ────────────────
 * middleware.ts hard-404s every `/admin/*` and `/api/admin/*` path unless the
 * request arrives on `panel.ahantime.com`, and playwright.config.ts sets
 * AUTH_ENFORCED=true, so the admin area was invisible to a suite driving
 * 127.0.0.1:3100. Pointing the suite at the panel hostname did not work
 * either, because `resolvePanelRouting` compared the RAW Host header against a
 * port-less hostname — `panel.ahantime.com:3100` never matched.
 *
 * Both halves are now closed: `normalizeHost` strips the port (and is
 * case-/trailing-dot-/IPv6-aware, with its own unit suite in
 * src/lib/server/utils/panelHost.test.ts), and this file runs against
 * PANEL_BASE_URL with Chromium's resolver pointed at the loopback server. The
 * Host header is real, not faked — which is what keeps `assertSameOrigin`
 * satisfied on the API calls below.
 *
 * A previously-noted trap, kept fixed: `loginAs` used to read a 5-digit OTP
 * out of the dev-code banner while CONSTANTS.OTP_LENGTH is 6. `{5}` still
 * MATCHED the first five characters, so `expect(code).toBeTruthy()` passed and
 * the failure surfaced much later as «کد تأیید باید ۶ رقم باشد» on submit.
 */
test.use({ baseURL: PANEL_BASE_URL });

// Every case here logs in from scratch, and each one is the FIRST visitor to
// some admin route that `next dev` still has to compile on demand (the panel
// login alone measured ~15s cold). The default 45s budget is spent on
// compilation before an assertion runs.
test.describe.configure({ timeout: 120_000 });

/**
 * Warm the OTP routes before any case logs in.
 *
 * `next dev` compiles a route on its first request — measured at 6-15s for
 * these — and that latency lands entirely inside the first test's login. It
 * made the first one or two cases fail while identical later ones passed,
 * which reads exactly like a real RBAC bug and is not one. Warming through
 * 127.0.0.1 rather than the panel hostname on purpose: `--host-resolver-rules`
 * is a CHROMIUM flag, so Node's own resolver (which APIRequestContext uses)
 * cannot resolve panel.ahantime.com — and it does not need to, since the same
 * route module is being compiled either way.
 */
test.beforeAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  // A throwaway number, never used by a case, so no per-mobile budget is spent
  // on a real fixture.
  await ctx.post('/api/auth/otp/request', { data: { mobile: '09129990000' } }).catch(() => {});
  await ctx.dispose();
});

async function loginAs(page: import('@playwright/test').Page, mobile: string) {
  // `?next=` is load-bearing, not decoration: it pins the post-login
  // destination to the admin area instead of relying on LoginForm's
  // host-dependent default. On this host `/login` is internally rewritten to
  // the chrome-free /panel-login; the browser URL stays /login.
  await page.goto('/login?next=/admin');
  // NOT `waitForLoadState('networkidle')`: this app never goes network-idle —
  // the market ticker polls on an interval by design — so that wait could only
  // ever burn the whole test budget and then fail on a page that was in fact
  // ready. Wait for the thing actually being interacted with instead.
  const mobileField = page.getByLabel('شمارهٔ موبایل');
  const submitBtn = page.getByRole('button', { name: 'دریافت کد تأیید' });
  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  await expect(submitBtn).toBeVisible();
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
    // Idempotent: once the code step is reached, STOP. Without this guard the
    // retry re-runs `mobileField.fill()` on a field that no longer exists and
    // throws forever — so a first attempt whose request merely took longer
    // than the inner timeout (a cold `next dev` compile of
    // /api/auth/otp/request is ~6-15s) failed the whole `toPass` even though
    // the login had in fact succeeded. That was the real reason this helper
    // timed out, not anything about the login itself.
    if (await devCodeStatus.isVisible()) return;
    if (await mobileField.isVisible()) {
      await mobileField.fill(mobile);
      await submitBtn.click();
    }
    await expect(devCodeStatus).toBeVisible({ timeout: 30_000 });
  }).toPass({ timeout: 90_000 });
  const text = await devCodeStatus.textContent();
  // SIX digits — CONSTANTS.OTP_LENGTH. See the same fix in auth.spec.ts: `{5}`
  // still matched (the first five characters of) a six-digit code, so this
  // drifted silently and left every test in this file failing at the submit.
  const code = text?.match(/[۰-۹0-9]{6}/)?.[0];
  expect(code).toBeTruthy();

  await page.getByRole('group', { name: 'کد تأیید پیامک‌شده' }).locator('input').first().pressSequentially(code!);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();
  // `toHaveURL(/\/admin/)` alone is NOT enough and quietly lied: the login URL
  // is `/login?next=/admin`, which MATCHES that pattern — so this helper
  // "succeeded" while the browser was still sitting on the login form, and the
  // failure resurfaced much later as an unexplained 401 from an admin API. Pin
  // that we actually LEFT the login page.
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page).toHaveURL(/\/admin(\/|$|\?)/);
}

test('content-role nav only lists permitted sections', async ({ page }) => {
  await loginAs(page, '09120000001');
  // `toHaveURL` above only confirms the navigation committed, not that the
  // (cold-compiling, on a first hit) admin layout has actually painted its
  // nav yet — reading `allTextContents()` immediately can race a still-empty
  // DOM. Wait for at least one nav link before reading all of them.
  // `aria-label="بخش‌های پنل"` — app/admin/layout.tsx:114. The old selector
  // said "پنل مدیریت", which exists nowhere in the app; because this file was
  // `test.fixme` nobody ever found out that the assertion could not have
  // matched anything even once the harness worked.
  const nav = page.locator('nav[aria-label="بخش‌های پنل"] a');
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

test('content-role direct navigation to an unpermitted page 404s', async ({ page }) => {
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

test('content-role can reach its own page', async ({ page }) => {
  await loginAs(page, '09120000003');
  const resp = await page.goto('/admin/content');
  expect(resp?.status()).toBe(200);
});

test('stats API only returns fields the role is permitted to see', async ({ page }) => {
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

test('palette: content role gets a 200 with zero lead rows, not a 403', async ({ page }) => {
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

test('palette: sales role sees leads but never users', async ({ page }) => {
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
