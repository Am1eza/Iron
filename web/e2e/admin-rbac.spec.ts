import { test, expect } from '@playwright/test';

/**
 * RBAC scoping for the admin area — a `content` role (seed fixture
 * 09120000001, see seed.ts) must only see/reach what `content:write` and
 * `content:publish` grant it. Direct navigation to an unpermitted admin page
 * must 404 (hide, don't reveal — same contract as the API guards).
 */
async function loginAs(page: import('@playwright/test').Page, mobile: string) {
  await page.goto('/login');
  await page.getByLabel('شمارهٔ موبایل').fill(mobile);
  await page.getByRole('button', { name: 'دریافت کد تأیید' }).click();

  const devCodeStatus = page.getByRole('status').filter({ hasText: 'کد آزمایشی' });
  await expect(devCodeStatus).toBeVisible();
  const text = await devCodeStatus.textContent();
  const code = text?.match(/[۰-۹0-9]{5}/)?.[0];
  expect(code).toBeTruthy();

  await page.getByRole('group', { name: 'کد تأیید پیامک‌شده' }).locator('input').first().pressSequentially(code!);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test('content-role nav only lists permitted sections', async ({ page }) => {
  await loginAs(page, '09120000001');
  const nav = page.locator('nav[aria-label="پنل مدیریت"]');
  // The nav's link set is role-filtered client-side (useAuth()'s Zustand
  // store), which can still be resolving right after the login redirect —
  // `.toContainText` auto-retries until the filtered links actually render,
  // unlike a one-shot `allTextContents()` snapshot.
  await expect(nav).toContainText('داشبورد');
  const navLabels = await nav.locator('a').allTextContents();
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
  const resp = await page.goto('/admin/pricing');
  expect(resp?.status()).toBe(404);
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
