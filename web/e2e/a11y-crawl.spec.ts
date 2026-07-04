import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * SCRATCH audit tool — not part of the permanent suite. BFS-crawls same-origin
 * links from a few seed pages, running the full axe ruleset (wcag2a/2aa/21aa/22aa)
 * on every unique path, and prints every violation (any impact) as JSON so the
 * audit can triage across the whole route surface instead of the 3 hardcoded
 * pages in accessibility.spec.ts. Delete this file before merging.
 */
test.setTimeout(600_000);

test('crawl + axe sweep', async ({ page, context }) => {
  const seeds = ['/', '/prices', '/market', '/blog', '/news', '/cooperation', '/club', '/ai', '/search'];
  const visited = new Set<string>();
  const queue: string[] = [...seeds];
  const allViolations: Record<string, unknown[]> = {};
  const skipPrefixes = ['/admin', '/account', '/api', '/logout'];
  let count = 0;
  const MAX_PAGES = 90;

  while (queue.length && count < MAX_PAGES) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    if (skipPrefixes.some((p) => path.startsWith(p))) continue;
    visited.add(path);
    count++;

    try {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 20_000 });
    } catch {
      continue;
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();

    if (results.violations.length) {
      allViolations[path] = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })),
      }));
    }

    const hrefs = await page.$$eval('a[href]', (as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href')).filter(Boolean) as string[],
    );
    for (const href of hrefs) {
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const clean = href.split('#')[0].split('?')[0];
      if (!clean || visited.has(clean) || queue.includes(clean)) continue;
      if (skipPrefixes.some((p) => clean.startsWith(p))) continue;
      queue.push(clean);
    }
  }

  console.log('CRAWL_PAGES_VISITED', JSON.stringify([...visited]));
  console.log('CRAWL_VIOLATIONS_JSON_START');
  console.log(JSON.stringify(allViolations, null, 2));
  console.log('CRAWL_VIOLATIONS_JSON_END');
});
