import { test, expect } from '@playwright/test';

/**
 * Real OTP login against the live-mode DB (dev-code fallback — see
 * playwright.config.ts's webServer env, which deliberately leaves
 * SMSIR_* unset so sms.ts dev-logs the code into the API response
 * instead of attempting a real send).
 */
test('OTP login: request code, verify with the dev code, land on account', async ({ page }) => {
  await page.goto('/login');
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
  // reads it — surfacing later as a "برای ثبت شماره معتبر لازم است" client
  // validation error despite the value looking right a moment earlier. So
  // retry the WHOLE fill+click+outcome sequence, not just the fill. This is
  // safe to repeat: a client-rejected or hydration-lost attempt never
  // reaches the server (no request is logged for it), and a genuinely
  // in-flight real request disables the submit button (`loading={submitting}`),
  // making a retried click on it a no-op rather than a second request.
  await expect(async () => {
    await mobileField.fill('09121234567');
    await submitBtn.click();
    await expect(devCodeStatus).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  const text = await devCodeStatus.textContent();
  const code = text?.match(/[۰-۹0-9]{5}/)?.[0];
  expect(code).toBeTruthy();

  // OtpInput is 5 separate single-digit boxes with auto-advance-on-type —
  // pressSequentially dispatches real keyboard events, so focus correctly
  // follows the auto-advance between digits (a plain .fill() would not).
  await page.getByRole('group', { name: 'کد تأیید پیامک‌شده' }).locator('input').first().pressSequentially(code!);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();

  await expect(page).toHaveURL(/\/account/);
});

test('admin routes redirect a logged-out visitor to /login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
