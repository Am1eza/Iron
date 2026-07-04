import { test, expect } from '@playwright/test';

/**
 * Golden-path smoke test against the REAL live-mode stack (actual API
 * routes, actual Postgres-wire-protocol DB — see playwright.config.ts).
 * This is the one check in the whole suite that no unit/integration test
 * can give: does a browser rendering the real server output actually show
 * seeded, DB-backed prices, not a mock fixture?
 */
test('homepage loads and shows the site identity', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/آهن‌تایم|Ahantime/i);
});

test('category price table renders real seeded rows from the live DB', async ({ page }) => {
  await page.goto('/prices/rebar');
  // The page also renders a BulkQuote comparison <table> further down —
  // the price table (PriceTable) is the first one in the DOM.
  const table = page.getByRole('table').first();
  await expect(table).toBeVisible();
  // Seed data (db/seed.ts) always includes میلگرد (rebar) rows for this category.
  await expect(table.getByText('میلگرد').first()).toBeVisible();
  const rows = table.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(5);
});

test('SKU detail page shows a live price, reached via the chart modal', async ({ page }) => {
  await page.goto('/prices/rebar');
  const chartBtn = page.getByRole('table').first().locator('tbody tr').first().getByLabel(/نمودار/);
  const viewSkuBtn = page.getByRole('button', { name: 'مشاهدهٔ صفحهٔ محصول' });
  // Row → chart icon opens a modal → "مشاهدهٔ صفحهٔ محصول" navigates to the
  // SKU detail page — there's no direct row link, this is the real path.
  // Retry the click: on a cold `next dev` compile the button is server-rendered
  // (and thus clickable per Playwright's actionability checks) slightly before
  // React finishes hydrating it, so the very first click on a fresh page load
  // can be lost — retrying re-issues the click until it actually lands.
  await expect(async () => {
    await chartBtn.click();
    await expect(viewSkuBtn).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await viewSkuBtn.click();
  await expect(page).toHaveURL(/\/prices\/rebar\/.+\/.+/);
  await expect(page.getByText('تومان').first()).toBeVisible();
});
