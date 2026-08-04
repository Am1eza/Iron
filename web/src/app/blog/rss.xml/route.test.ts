/**
 * Same defect class as `app/sitemap.test.ts`: both feeds are prerendered at
 * build time, where `isLiveCatalog()` is false and `getAllPublishedArticles`
 * answers from `lib/mock`. A feed of fixture articles points every subscriber
 * at URLs that do not exist, and the deploy restores that body from the image
 * on every container recreate.
 *
 * Covers /news/rss.xml too — the two routes are byte-for-byte the same shape
 * and a second file would only drift.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const catalog = vi.hoisted(() => ({
  isLiveCatalog: vi.fn(() => false),
  getAllPublishedArticles: vi.fn(),
}));

vi.mock('@/lib/server/catalog', () => catalog);

const FIXTURES = [
  { slug: 'choosing-rebar-grade', title: 't', excerpt: 'e', publishAt: '2026-01-01T00:00:00.000Z' },
];

async function load(feed: 'blog' | 'news') {
  vi.resetModules();
  const mod = feed === 'blog' ? await import('./route') : await import('../../news/rss.xml/route');
  return mod.GET();
}

beforeEach(() => {
  vi.clearAllMocks();
  catalog.getAllPublishedArticles.mockResolvedValue(FIXTURES);
});

describe.each(['blog', 'news'] as const)('/%s/rss.xml', (feed) => {
  it('emits an empty feed rather than fixture articles when the catalog is not live', async () => {
    catalog.isLiveCatalog.mockReturnValue(false);

    const xml = await (await load(feed)).text();

    expect(xml).not.toContain('choosing-rebar-grade');
    expect(xml).not.toContain('<item>');
    // Still a well-formed feed — an empty channel, not a broken document.
    expect(xml).toContain('<rss');
    expect(xml).toContain('</rss>');
  });

  it('does not even read the catalog when it is not live', async () => {
    catalog.isLiveCatalog.mockReturnValue(false);

    await load(feed);

    expect(catalog.getAllPublishedArticles).not.toHaveBeenCalled();
  });

  it('emits the real articles when the catalog is live', async () => {
    catalog.isLiveCatalog.mockReturnValue(true);

    const xml = await (await load(feed)).text();

    expect(xml).toContain('choosing-rebar-grade');
    expect(catalog.getAllPublishedArticles).toHaveBeenCalledWith(feed);
  });
});
