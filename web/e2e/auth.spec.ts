import { test, expect } from '@playwright/test';

/**
 * Real OTP login against the live-mode DB (dev-code fallback — see
 * playwright.config.ts's webServer env, which deliberately leaves
 * SMSIR_* unset so sms.ts dev-logs the code into the API response
 * instead of attempting a real send).
 */
test('OTP login: request code, verify with the dev code, land on account', async ({ page }) => {
  await page.goto('/login');
  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  // Retry the fill+submit: on a cold `next dev` compile, the mobile field is
  // a React-controlled input that can be filled by Playwright fractionally
  // before hydration attaches its onChange handler — the DOM value briefly
  // shows the typed number, then React's own (still-empty) state re-renders
  // over it, clearing the field and failing client validation. Re-filling
  // and re-submitting until the OTP step actually appears rides out that
  // window instead of racing it once.
  await expect(async () => {
    await page.getByLabel('شمارهٔ موبایل').fill('09121234567');
    await page.getByRole('button', { name: 'دریافت کد تأیید' }).click();
    await expect(devCodeStatus).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
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
