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
  const navLabels = await page.locator('nav[aria-label="پنل مدیریت"] a').allTextContents();
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
