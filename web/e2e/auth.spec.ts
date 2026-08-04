import { test, expect } from '@playwright/test';
import { PANEL_BASE_URL } from '../playwright.config';

/**
 * Real OTP login against the live-mode DB (dev-code fallback — see
 * playwright.config.ts's webServer env, which deliberately leaves
 * SMSIR_* unset so sms.ts dev-logs the code into the API response
 * instead of attempting a real send).
 */
test.describe.configure({ timeout: 120_000 });

test('OTP login: request code, verify with the dev code, land on account', async ({ page }) => {
  await page.goto('/login');
  const mobileField = page.getByLabel('شمارهٔ موبایل');
  const submitBtn = page.getByRole('button', { name: 'دریافت کد تأیید' });
  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  // The mobile field is a React-controlled input, and the form has no
  // `action`/`method` fallback — both the fill and the click depend on
  // hydration having attached React's handlers. Confirming the DOM value
  // right after `.fill()` is NOT enough: hydration can still commit *after*
  // that check passes, re-rendering the input from React's own (still-empty)
  // state and silently discarding the native fill before the click ever
  // reads it — surfacing later as a "برای ثبت شماره معتبر لازم است" client
  // validation error despite the value looking right a moment earlier. So
  // retry the WHOLE fill+click+outcome sequence, not just the fill. This is
  // safe to repeat: a client-rejected or hydration-lost attempt never
  // reaches the server (no request is logged for it), and a genuinely
  // in-flight real request disables the submit button (`loading={submitting}`),
  // making a retried click on it a no-op rather than a second request.
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
      await mobileField.fill('09121234567');
      await submitBtn.click();
    }
    await expect(devCodeStatus).toBeVisible({ timeout: 30_000 });
  }).toPass({ timeout: 90_000 });
  const text = await devCodeStatus.textContent();
  // SIX digits — CONSTANTS.OTP_LENGTH. This read `{5}`, which still MATCHES a
  // six-digit code (just the first five characters of it), so the drift after
  // the 5→6 change failed silently: five boxes filled, the sixth empty, and
  // every auth-dependent spec died on «کد تأیید باید ۶ رقم باشد» at the submit
  // rather than at this line. `expect(code).toBeTruthy()` below cannot catch
  // that — a truncated match is still truthy — so the length is pinned here.
  const code = text?.match(/[۰-۹0-9]{6}/)?.[0];
  expect(code).toBeTruthy();

  // OtpInput is 6 separate single-digit boxes with auto-advance-on-type —
  // pressSequentially dispatches real keyboard events, so focus correctly
  // follows the auto-advance between digits (a plain .fill() would not).
  await page.getByRole('group', { name: 'کد تأیید پیامک‌شده' }).locator('input').first().pressSequentially(code!);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();

  // W29: a brand-new account is asked for its name AFTER the code is verified,
  // not before. The OTP-request response used to carry `isNewUser`, which was
  // free user enumeration for anyone (see lib/auth/service.ts#requestOtp); the
  // same UX now costs a correct one-time code. The session is already live at
  // this point, so this is a completion prompt, not a gate.
  // By ROLE + accessible name: the visible label carries a required marker, so
  // `getByLabel('نام', { exact: true })` matches nothing.
  await page.getByRole('textbox', { name: 'نام', exact: true }).fill('آزمون');
  await page.getByRole('textbox', { name: 'نام خانوادگی', exact: true }).fill('کاربر');
  await page.getByRole('button', { name: 'تکمیل ثبت‌نام' }).click();

  await expect(page).toHaveURL(/\/account/);
});

/**
 * The admin gate's TWO halves. This test used to assert only "/admin →
 * /login", which stopped being true at 28ff293 ("make the admin gate fail
 * closed") — on the public host /admin is now HIDDEN, not redirected, and a
 * redirect there would itself be the leak (it would confirm the panel
 * exists). The test kept passing for a while and then silently asserted the
 * wrong contract; both halves are pinned now.
 */
test('the public host HIDES /admin — it must not redirect, which would confirm the panel exists', async ({ page }) => {
  await page.goto('/admin');
  // URL unchanged (a rewrite, not a redirect) and the not-found UI rendered.
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('این صفحه پیدا نشد')).toBeVisible();
});

test('the PANEL host sends a logged-out visitor to the login flow', async ({ page }) => {
  await page.goto(`${PANEL_BASE_URL}/`);
  // Middleware bounces an absent/expired access cookie through
  // /api/auth/silent first (that hop is what stopped staff being logged out —
  // and charged for an SMS — after every short break); with no refresh cookie
  // at all it falls through to the login page.
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'دریافت کد تأیید' })).toBeVisible();
});
