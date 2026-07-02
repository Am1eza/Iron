import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * WCAG 2.2 AA automated sweep (design/accessibility.md) on the pages a
 * first-time visitor actually lands on — real DOM from the live server,
 * not a static/mocked render.
 */
for (const path of ['/', '/prices/rebar', '/login']) {
  test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
