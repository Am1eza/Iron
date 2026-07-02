import { test, expect } from '@playwright/test';

/**
 * Real OTP login against the live-mode DB (dev-code fallback — see
 * playwright.config.ts's webServer env, which deliberately leaves
 * SMSIR_* unset so sms.ts dev-logs the code into the API response
 * instead of attempting a real send).
 */
test('OTP login: request code, verify with the dev code, land on account', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('شمارهٔ موبایل').fill('09121234567');
  await page.getByRole('button', { name: 'دریافت کد تأیید' }).click();

  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  await expect(devCodeStatus).toBeVisible();
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
