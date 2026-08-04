import { expect, type Page } from '@playwright/test';

/**
 * Panel login helper, extracted from the pattern proved out in
 * admin-rbac.spec.ts (see that file's comments for WHY each step is shaped
 * the way it is — the six-digit OTP regex, the whole-sequence retry around
 * hydration, and the `not.toHaveURL(/\/login/)` assertion that stops this
 * from "succeeding" while still sitting on the form).
 *
 * Kept in its own module rather than exported from a spec file so importing
 * it does not drag another spec's `test.use()` into scope.
 */
export async function loginToPanel(page: Page, mobile: string, next = '/admin'): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const mobileField = page.getByLabel('شمارهٔ موبایل');
  const submitBtn = page.getByRole('button', { name: 'دریافت کد تأیید' });
  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  await expect(submitBtn).toBeVisible();
  await expect(async () => {
    if (await devCodeStatus.isVisible()) return;
    if (await mobileField.isVisible()) {
      await mobileField.fill(mobile);
      await submitBtn.click();
    }
    await expect(devCodeStatus).toBeVisible({ timeout: 30_000 });
  }).toPass({ timeout: 90_000 });
  const text = await devCodeStatus.textContent();
  const code = text?.match(/[۰-۹0-9]{6}/)?.[0];
  expect(code).toBeTruthy();
  await page
    .getByRole('group', { name: 'کد تأیید پیامک‌شده' })
    .locator('input')
    .first()
    .pressSequentially(code!);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
