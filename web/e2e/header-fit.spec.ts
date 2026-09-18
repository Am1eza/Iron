import { test, expect } from '@playwright/test';

/**
 * The desktop header row (logo + primary nav + login/language switcher) must
 * fit inside its own container, in every locale, at every desktop width.
 *
 * It did not: the width budget was checked with Persian labels only, and on
 * 2026-09-18 the English row needed 1346px of a 1216px container, so the
 * language switcher and the login button ran off the right edge of every
 * 1280–1440px laptop screen (98px at 1280). Arabic was 55px over. Nothing
 * else fails when this regresses. A unit test cannot measure rendered text
 * width, so this measures the real rendered row in a real browser, with the
 * self-hosted fonts the site ships. See the budget in Header.module.css.
 */
const LOCALES = [
  { prefix: '', name: 'fa' },
  { prefix: '/en', name: 'en' },
  { prefix: '/ar', name: 'ar' },
  { prefix: '/zh', name: 'zh' },
];
// 1280 is the first width with the full nav (below it the menu button takes
// over); 1366 and 1440 are the commonest laptop widths; past 1280 the
// container stops growing, so 1920 is the same budget with more margin.
const WIDTHS = [1280, 1366, 1440, 1920];

for (const { prefix, name } of LOCALES) {
  test(`${name}: the desktop header row fits its container`, async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS[0]!, height: 900 });
    await page.goto(`${prefix}/prices/rebar`);
    await expect(page.getByRole('banner').getByRole('navigation').first()).toBeVisible();
    // Fonts decide text width, so measure only once they have loaded.
    // `document.fonts.ready` alone is not that: it resolves at once if no
    // font load has STARTED yet, and then the row is measured in the system
    // fallback. Load the face the header is set in explicitly.
    const fontBefore = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.family === 'vazirmatn').map((f) => f.status).join(',')
    );
    const fontAfter = await page.evaluate(async () => {
      await document.fonts.load('500 1em vazirmatn');
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.family === 'vazirmatn').map((f) => f.status).join(',');
    });
    console.log(`[header-fit] ${name}: vazirmatn before=${fontBefore} after=${fontAfter}`);
    expect(fontAfter, 'vazirmatn must be loaded before measuring').toContain('loaded');

    // TEMP diagnostic: per-item widths at 1280.
    console.log(`[header-fit] ${name} items: ` + (await page.evaluate(() => {
      const inner = document.querySelector('header[data-site-chrome] [class*="inner"]') as HTMLElement;
      return [...inner.querySelectorAll(':scope > * , :scope > * > *, [class*="primary"] li > *')]
        .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
        .map((e) => `${(e.className.toString().split(' ')[0] || e.tagName).replace(/-module__\w+__/, '.')}"${(e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 24)}"=${e.getBoundingClientRect().width.toFixed(1)}`)
        .join(' | ');
    })));
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const fit = await page.evaluate(() => {
        // `.inner` IS the `.container` (Header.tsx), so its border box
        // includes the container padding; the row's usable span is the
        // content box inside it.
        const inner = document.querySelector('header[data-site-chrome] [class*="inner"]') as HTMLElement;
        const box = inner.getBoundingClientRect();
        const style = getComputedStyle(inner);
        const left = box.left + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.paddingRight);
        const out = [...inner.children]
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => ({ cls: el.className.toString().split(' ')[0], r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.left < left - 0.5 || r.right > right + 0.5)
          .map(({ cls, r }) => `${cls} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
        // Context for a failure: the per-locale spacing in Header.module.css
        // keys off `:root:lang(..)`, so a wrong served lang looks exactly
        // like a too-long label.
        const link = inner.querySelector('[class*="navLink"]') as HTMLElement | null;
        return {
          span: `[${Math.round(left)}, ${Math.round(right)}] lang=${document.documentElement.lang} navLink padding=${link ? getComputedStyle(link).paddingInlineStart : '?'}`,
          out,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(fit.out, `${name} @ ${width}px: row ${fit.span}`).toEqual([]);
      expect(fit.docOverflow, `${name} @ ${width}px: document wider than the viewport`).toBeLessThanOrEqual(0);
    }
  });
}
