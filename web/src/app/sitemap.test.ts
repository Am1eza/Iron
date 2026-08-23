/**
 * The regression this file exists for
 * -----------------------------------
 * `sitemap.ts` was cached (`revalidate = 3600`), so the production image
 * shipped a prerendered copy generated in CI — where there is no
 * `DATABASE_URL`, so `isLiveCatalog()` is false and every catalog helper
 * answers from `lib/mock`. The served sitemap listed 7 categories /
 * 45 sub-categories / 243 SKUs against a database holding 14 / 60 / 135:
 * 203 URLs that 404, and 117 live URLs never advertised. Each deploy recreated
 * the container and restored that fixture body, so it could stay pinned.
 *
 * Two independent properties are pinned here, because either one alone would
 * have let the bug through:
 *
 *  1. Without a live catalog, the sitemap emits ONLY code-defined static
 *     routes — never a fixture-derived URL. (`emits no catalog URLs`)
 *  2. The route is not cacheable, so no build artifact of it can exist to be
 *     restored by a restart. (`is not prerenderable`)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATIC_INDEXABLE, routes } from '@/lib/routes';
import { MOCK_CATEGORY_SUBS } from '@/lib/data/nav';
import { NEWS_TOPICS } from '@/lib/data/newsTopics';
import type * as RedirectsRepo from '@/lib/server/repos/redirectsRepo';

const catalog = vi.hoisted(() => ({
  isLiveCatalog: vi.fn(() => false),
  getCategories: vi.fn(),
  getRows: vi.fn(),
  getSubsMap: vi.fn(),
  getAllPublishedArticles: vi.fn(),
  getCategoryArticleCounts: vi.fn(),
  getNewsTopicArticleCounts: vi.fn(),
}));

vi.mock('@/lib/server/catalog', () => catalog);

/** The redirect table is a second, independent source of "do not advertise
 *  this URL" — see `dropRedirectedEntries`. `normalizePath` stays real. */
const redirectsRepo = vi.hoisted(() => ({
  listRedirectFromPaths: vi.fn(async () => new Set<string>()),
}));

vi.mock('@/lib/server/repos/redirectsRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof RedirectsRepo>()),
  ...redirectsRepo,
}));

/** What the seam really returns in mock mode — the fixtures themselves. */
function useMockCatalog() {
  catalog.isLiveCatalog.mockReturnValue(false);
  catalog.getCategories.mockResolvedValue(
    Object.keys(MOCK_CATEGORY_SUBS).map((slug, i) => ({
      slug,
      name: slug,
      order: i,
      isActive: true,
    })),
  );
  catalog.getSubsMap.mockResolvedValue(MOCK_CATEGORY_SUBS);
  catalog.getRows.mockImplementation(async (cat: string) =>
    (MOCK_CATEGORY_SUBS[cat] ?? []).map((sub) => ({
      slug: `${cat}-${sub.slug}-fixture`,
      categoryId: cat,
      subCategoryId: sub.slug,
      current: { updatedAt: '2026-01-01T00:00:00.000Z' },
    })),
  );
  catalog.getAllPublishedArticles.mockResolvedValue([
    { slug: 'fixture-article', publishAt: '2026-01-01T00:00:00.000Z' },
  ]);
  catalog.getCategoryArticleCounts.mockResolvedValue({});
  catalog.getNewsTopicArticleCounts.mockResolvedValue({});
}

async function loadSitemap() {
  vi.resetModules();
  const mod = await import('./sitemap');
  return mod;
}

const paths = (entries: Array<{ url: string }>) => entries.map((e) => new URL(e.url).pathname);

beforeEach(() => {
  vi.clearAllMocks();
  redirectsRepo.listRedirectFromPaths.mockResolvedValue(new Set<string>());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sitemap · the mock path can never produce catalog URLs', () => {
  it('emits no catalog URLs when the catalog is not live', async () => {
    useMockCatalog();
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    // Nothing under /prices/<category>[/...], /blog/<slug> or /news/<slug>.
    const catalogish = got.filter((p) => /^\/prices\/[^/]+|^\/blog\/[^/]+|^\/news\/[^/]+/.test(p));
    expect(catalogish).toEqual([]);
  });

  it('emits no URL derived from MOCK_CATEGORY_SUBS', async () => {
    useMockCatalog();
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap()).join('\n');

    for (const [cat, subs] of Object.entries(MOCK_CATEGORY_SUBS)) {
      expect(got).not.toContain(routes.category(cat));
      for (const sub of subs) expect(got).not.toContain(routes.subCategory(cat, sub.slug));
    }
    // `sheet` is the sharp case: a fixture category that is is_active=false in
    // the live database, i.e. a URL Google was being told to crawl that 404s.
    expect(got).not.toContain('/prices/sheet');
  });

  it('still emits every code-defined static route (omitting is fine, inventing is not)', async () => {
    useMockCatalog();
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    for (const path of STATIC_INDEXABLE) expect(got).toContain(path);
    expect(got).toContain(routes.cooperation('supply'));
  });

  it('does not consult the catalog at all when it is not live', async () => {
    useMockCatalog();
    const { default: sitemap } = await loadSitemap();

    await sitemap();

    expect(catalog.getCategories).not.toHaveBeenCalled();
    expect(catalog.getRows).not.toHaveBeenCalled();
    expect(catalog.getSubsMap).not.toHaveBeenCalled();
    expect(catalog.getAllPublishedArticles).not.toHaveBeenCalled();
    expect(catalog.getCategoryArticleCounts).not.toHaveBeenCalled();
    expect(catalog.getNewsTopicArticleCounts).not.toHaveBeenCalled();
  });
});

describe('sitemap · the live path', () => {
  beforeEach(() => {
    catalog.isLiveCatalog.mockReturnValue(true);
    catalog.getCategories.mockResolvedValue([
      { slug: 'varagh-garm', name: 'ورق گرم', order: 0, isActive: true },
      { slug: 'sheet', name: 'ورق', order: 1, isActive: false },
    ]);
    catalog.getSubsMap.mockResolvedValue({ 'varagh-garm': [{ slug: 'st37', name: 'ST37' }] });
    catalog.getRows.mockResolvedValue([
      {
        slug: 'varagh-garm-st37-2mm',
        categoryId: 'varagh-garm',
        subCategoryId: 'st37',
        current: { updatedAt: '2026-02-02T00:00:00.000Z' },
      },
    ]);
    catalog.getAllPublishedArticles.mockResolvedValue([]);
    catalog.getCategoryArticleCounts.mockResolvedValue({});
    catalog.getNewsTopicArticleCounts.mockResolvedValue({});
  });

  it('emits the database taxonomy and skips inactive categories', async () => {
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    expect(got).toContain('/prices/varagh-garm');
    expect(got).toContain('/prices/varagh-garm/st37');
    expect(got).toContain('/prices/varagh-garm/st37/varagh-garm-st37-2mm');
    expect(got).not.toContain('/prices/sheet');
  });
});

describe('sitemap · /blog/category/* entries (US-14.5)', () => {
  beforeEach(() => {
    catalog.isLiveCatalog.mockReturnValue(true);
    catalog.getCategories.mockResolvedValue([
      { id: 'cat-rebar', slug: 'rebar', name: 'میلگرد', order: 0, isActive: true },
      { id: 'cat-pipe', slug: 'pipe', name: 'لوله', order: 1, isActive: true },
    ]);
    catalog.getSubsMap.mockResolvedValue({});
    catalog.getRows.mockResolvedValue([]);
    catalog.getAllPublishedArticles.mockResolvedValue([]);
    catalog.getNewsTopicArticleCounts.mockResolvedValue({});
  });

  it('includes a category page only when it has at least one published article', async () => {
    catalog.getCategoryArticleCounts.mockResolvedValue({ 'cat-rebar': 5 });
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    expect(got).toContain(routes.blogCategory('rebar'));
    // لوله has zero counted articles — a thin/empty page must not be
    // advertised to Google even though the category itself is real and
    // active (see knownPaths.ts — it still answers a real 200, just isn't
    // in the sitemap).
    expect(got).not.toContain(routes.blogCategory('pipe'));
  });

  it('advertises no category pages at all when nothing has been categorised yet', async () => {
    catalog.getCategoryArticleCounts.mockResolvedValue({});
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    expect(got).not.toContain(routes.blogCategory('rebar'));
    expect(got).not.toContain(routes.blogCategory('pipe'));
  });
});

describe('sitemap · /news/topic/* entries', () => {
  beforeEach(() => {
    catalog.isLiveCatalog.mockReturnValue(true);
    catalog.getCategories.mockResolvedValue([]);
    catalog.getSubsMap.mockResolvedValue({});
    catalog.getRows.mockResolvedValue([]);
    catalog.getAllPublishedArticles.mockResolvedValue([]);
    catalog.getCategoryArticleCounts.mockResolvedValue({});
  });

  it('includes a topic page only when it has at least one published news article', async () => {
    const [withArticles, withoutArticles] = NEWS_TOPICS;
    catalog.getNewsTopicArticleCounts.mockResolvedValue({ [withArticles.slug]: 3 });
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    expect(got).toContain(routes.newsTopic(withArticles.slug));
    // Zero counted articles — a thin/empty page must not be advertised to
    // Google even though the topic itself is real (see knownPaths.ts — it
    // still answers a real 200, just isn't in the sitemap).
    expect(got).not.toContain(routes.newsTopic(withoutArticles.slug));
  });

  it('advertises no topic pages at all when nothing has been tagged yet', async () => {
    catalog.getNewsTopicArticleCounts.mockResolvedValue({});
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    for (const t of NEWS_TOPICS) expect(got).not.toContain(routes.newsTopic(t.slug));
  });
});

describe('sitemap · is not prerenderable', () => {
  it('declares force-dynamic and no revalidate window', async () => {
    const mod = await loadSitemap();

    expect(mod.dynamic).toBe('force-dynamic');
    // A `revalidate` export is what let the build bake a fixture copy that a
    // container restart then restored. There must not be one.
    expect('revalidate' in mod).toBe(false);
  });

  it('has no force-static escape hatch in the source', () => {
    // cwd-relative, not import.meta.url — vitest's transform does not give
    // this module a file: URL.
    const src = readFileSync(resolve(process.cwd(), 'src/app/sitemap.ts'), 'utf8');
    expect(src).not.toMatch(/^export const (revalidate|dynamic\s*=\s*'force-static')/m);
  });
});

describe('sitemap · a URL the site redirects away is never advertised', () => {
  beforeEach(() => {
    catalog.isLiveCatalog.mockReturnValue(true);
    catalog.getCategories.mockResolvedValue([
      { id: 'cat-profile', slug: 'profile', name: 'پروفیل', order: 0, isActive: true },
    ]);
    catalog.getSubsMap.mockResolvedValue({
      profile: [
        { slug: 'prvfyl-snaty', name: 'پروفیل صنعتی' },
        { slug: 'profil-sotuni', name: 'پروفیل ستونی' },
      ],
    });
    catalog.getRows.mockResolvedValue([]);
    catalog.getAllPublishedArticles.mockResolvedValue([]);
    catalog.getCategoryArticleCounts.mockResolvedValue({});
    catalog.getNewsTopicArticleCounts.mockResolvedValue({});
  });

  // The real production case (1405/05/31): three `is_active = true`
  // sub-categories under پروفیل were published in the sitemap and 308'd back
  // to `/prices/profile`. The rows that did it were NOT re-slug leftovers, as
  // it first appeared — they were retire-to-parent rows written while those
  // sub-categories were empty, which the owner then walked back into by
  // re-creating the sub-categories under the same auto-derived slugs. Either
  // way the catalog queries cannot see it; only the redirect table can. The
  // rows are gone (`scripts/unshadowProfileSubCategories.ts`); this gate has
  // to survive them, because the create path can still produce the collision.
  it('drops a live sub-category that a redirect row shadows', async () => {
    redirectsRepo.listRedirectFromPaths.mockResolvedValue(
      new Set(['/prices/profile/prvfyl-snaty']),
    );
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    expect(got).not.toContain('/prices/profile/prvfyl-snaty');
    expect(got).toContain('/prices/profile/profil-sotuni');
    expect(got).toContain('/prices/profile');
  });

  it('drops a redirected static route too, not just catalog URLs', async () => {
    redirectsRepo.listRedirectFromPaths.mockResolvedValue(new Set(['/cut-to-size']));
    const { default: sitemap } = await loadSitemap();

    expect(paths(await sitemap())).not.toContain('/cut-to-size');
  });

  it('changes nothing when no redirects are configured', async () => {
    const { default: sitemap } = await loadSitemap();

    const got = paths(await sitemap());

    expect(got).toContain('/prices/profile/prvfyl-snaty');
    expect(got).toContain('/prices/profile/profil-sotuni');
  });
});

describe('dropRedirectedEntries', () => {
  const entry = (path: string) => ({ url: `https://ahantime.com${path}` });

  it('matches on the pathname, ignoring the origin', async () => {
    const { dropRedirectedEntries } = await loadSitemap();

    const got = dropRedirectedEntries([entry('/a'), entry('/b')], new Set(['/a']));

    expect(got.map((e) => e.url)).toEqual(['https://ahantime.com/b']);
  });

  it('normalizes the pathname the same way middleware looks it up', async () => {
    // `normalizePath` strips a trailing slash; a stored `/a` must still match
    // an entry emitted as `/a/`, or the filter silently misses.
    const { dropRedirectedEntries } = await loadSitemap();

    expect(dropRedirectedEntries([entry('/a/')], new Set(['/a']))).toEqual([]);
  });

  it('returns the input untouched for an empty redirect set', async () => {
    const { dropRedirectedEntries } = await loadSitemap();
    const input = [entry('/a')];

    expect(dropRedirectedEntries(input, new Set())).toBe(input);
  });
});
