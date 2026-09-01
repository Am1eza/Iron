import { describe, it, expect, vi, beforeEach } from 'vitest';

const { publicCatalogPaths, publishedGuardPaths, hasDb } = vi.hoisted(() => ({
  publicCatalogPaths: vi.fn(async () => [] as string[]),
  publishedGuardPaths: vi.fn(async () => [] as string[]),
  hasDb: vi.fn(() => true),
}));
vi.mock('@/lib/server/repos/catalogRepo', () => ({ publicCatalogPaths }));
vi.mock('@/lib/server/repos/articlesRepo', () => ({ publishedGuardPaths }));
vi.mock('@/lib/server/db/client', () => ({ hasDb }));

import {
  STATIC_DYNAMIC_PATHS,
  hasGuardedPrefix,
  isGuardedPath,
  normalizeKnownPath,
  shouldNotFound,
  getKnownPaths,
  invalidateKnownPaths,
} from './knownPaths';
import { TRACK_ORDER } from '@/components/cooperation/tracks';
import { NEWS_TOPICS } from '@/lib/data/newsTopics';

const known = new Set([
  '/prices/rebar',
  '/prices/rebar/deformed',
  '/prices/rebar/deformed/rebar-14-a3-zob',
  '/prices/pipe',
  '/prices/pipe/gas',
  '/blog/what-is-a3',
  '/news/market-update',
  // The archive pages that exist — see `publishedGuardPaths`.
  '/blog/page/2',
  // Facet landing pages. Same depth as a SKU URL, so the SKU pattern already
  // guards them — which means an absent entry here is a hard 404, not a
  // soft one. `publicCatalogPaths` supplies these.
  '/prices/rebar/factory/abhr',
  '/prices/rebar/size/14',
]);

describe('shouldNotFound', () => {
  it('leaves every real catalog URL alone', () => {
    for (const p of known) expect(shouldNotFound(p, known)).toBe(false);
  });

  it('404s an unknown slug at every catalog depth', () => {
    expect(shouldNotFound('/prices/no-such-cat', known)).toBe(true);
    expect(shouldNotFound('/prices/rebar/no-such-sub', known)).toBe(true);
    expect(shouldNotFound('/prices/rebar/deformed/no-such-sku', known)).toBe(true);
  });

  it('404s an unknown factory/size but not a real one', () => {
    expect(shouldNotFound('/prices/rebar/factory/abhr', known)).toBe(false);
    expect(shouldNotFound('/prices/rebar/size/14', known)).toBe(false);
    // A factory that exists in another category must not answer here.
    expect(shouldNotFound('/prices/pipe/factory/abhr', known)).toBe(true);
    expect(shouldNotFound('/prices/rebar/size/999', known)).toBe(true);
    // The literal segment on its own is a sub-category URL, and there is no
    // sub-category called `factory` — reserved by subCategorySlugSchema.
    expect(shouldNotFound('/prices/rebar/factory', known)).toBe(true);
  });

  it('404s a real SKU requested under the wrong category/sub', () => {
    // The [sku] page's duplicate-content guard: a SKU resolves only under its
    // own canonical path. The set is keyed on that path, so this falls out.
    expect(shouldNotFound('/prices/pipe/gas/rebar-14-a3-zob', known)).toBe(true);
  });

  it('404s an unknown article but not the index pages', () => {
    expect(shouldNotFound('/blog/nope', known)).toBe(true);
    expect(shouldNotFound('/news/nope', known)).toBe(true);
    expect(shouldNotFound('/blog', known)).toBe(false);
    expect(shouldNotFound('/news', known)).toBe(false);
    expect(shouldNotFound('/prices', known)).toBe(false);
  });

  it('never touches a path outside the guarded families', () => {
    for (const p of ['/', '/about', '/ai', '/api/catalog/rows', '/admin/pricing', '/account/orders']) {
      expect(shouldNotFound(p, known)).toBe(false);
    }
  });

  it('FAILS OPEN on an unloaded set — a DB outage must not kill the catalog', () => {
    expect(shouldNotFound('/prices/no-such-cat', new Set())).toBe(false);
    expect(shouldNotFound('/prices/rebar/deformed/no-such-sku', new Set())).toBe(false);
  });

  it('ignores a trailing slash rather than 404ing on it', () => {
    expect(shouldNotFound('/prices/rebar/deformed/', known)).toBe(false);
  });

  it('judges a percent-encoded path by what it decodes to', () => {
    expect(shouldNotFound('/prices/rebar/%64eformed', known)).toBe(false);
    expect(shouldNotFound('/prices/rebar/%64eform-nope', known)).toBe(true);
  });

  it('does not throw on a malformed escape sequence', () => {
    expect(() => shouldNotFound('/prices/rebar/%zz', known)).not.toThrow();
    expect(shouldNotFound('/prices/rebar/%zz', known)).toBe(true);
  });

  it('leaves a path deeper than any catalog route to Next’s own router', () => {
    expect(shouldNotFound('/prices/a/b/c/d', known)).toBe(false);
    expect(isGuardedPath('/prices/a/b/c/d')).toBe(false);
  });

  // Regression: `/blog/rss.xml` matches /^\/blog\/[^/]+$/ and is obviously not
  // a published article slug, so the guard hard-404'd both feeds on the live
  // site while /blog and /news kept advertising them via
  // <link rel="alternate" type="application/rss+xml">. Real file routes win
  // over [slug] in Next's router; this guard has to agree.
  it('never 404s a real static route that sits under a guarded prefix', () => {
    for (const feed of ['/blog/rss.xml', '/news/rss.xml']) {
      expect(isGuardedPath(feed)).toBe(false);
      expect(shouldNotFound(feed, known)).toBe(false);
      expect(shouldNotFound(feed, new Set<string>())).toBe(false);
    }
  });
});

describe('code-defined families (/tools, /cooperation, /news/topic)', () => {
  it('404s an unknown slug even with NO database data loaded', () => {
    // These sets cannot change at runtime, so they never depend on a query
    // and never need the fail-open escape hatch.
    expect(shouldNotFound('/tools/nope', new Set())).toBe(true);
    expect(shouldNotFound('/cooperation/nope', new Set())).toBe(true);
    expect(shouldNotFound('/news/topic/nope', new Set())).toBe(true);
  });

  it('leaves every real tool and track alone', () => {
    for (const p of STATIC_DYNAMIC_PATHS) expect(shouldNotFound(p, new Set())).toBe(false);
  });

  it('stays in step with the cooperation page’s own TRACK_ORDER', () => {
    // The page and the guard read from two places; if they ever drift, the
    // guard would 404 a live track. Assert them equal instead of hoping.
    expect(TRACK_ORDER.map((t) => `/cooperation/${t}`).sort()).toEqual(
      STATIC_DYNAMIC_PATHS.filter((p) => p.startsWith('/cooperation/')).slice().sort(),
    );
  });

  it('stays in step with the fixed NEWS_TOPICS list', () => {
    expect(NEWS_TOPICS.map((t) => `/news/topic/${t.slug}`).sort()).toEqual(
      STATIC_DYNAMIC_PATHS.filter((p) => p.startsWith('/news/topic/')).slice().sort(),
    );
  });
});

describe('cold redirect cache', () => {
  it('does not 404 a DB-backed path before the redirect table has loaded', () => {
    // Middleware checks redirects FIRST. 404ing here while that lookup is
    // still cold would turn a renamed URL's 308 into a 404 — observed on a
    // cold process during verification, which is why the flag exists.
    expect(shouldNotFound('/prices/old-renamed-slug', known, { redirectsLoaded: false })).toBe(false);
    expect(shouldNotFound('/prices/old-renamed-slug', known, { redirectsLoaded: true })).toBe(true);
  });

  it('still guards the code-defined families while redirects are cold', () => {
    expect(shouldNotFound('/tools/nope', new Set(), { redirectsLoaded: false })).toBe(true);
  });
});

describe('hasGuardedPrefix', () => {
  it('is the cheap gate that keeps non-catalog traffic off the catalog query', () => {
    expect(hasGuardedPrefix('/prices/rebar')).toBe(true);
    expect(hasGuardedPrefix('/blog/x')).toBe(true);
    expect(hasGuardedPrefix('/news/x')).toBe(true);
    expect(hasGuardedPrefix('/tools/weight')).toBe(true);
    expect(hasGuardedPrefix('/cooperation/supply')).toBe(true);
    expect(hasGuardedPrefix('/')).toBe(false);
    expect(hasGuardedPrefix('/prices')).toBe(false);
    expect(hasGuardedPrefix('/api/ai/chat')).toBe(false);
  });
});

describe('normalizeKnownPath', () => {
  it('keeps the root as-is', () => {
    expect(normalizeKnownPath('/')).toBe('/');
  });
  it('strips trailing slashes', () => {
    expect(normalizeKnownPath('/prices/rebar//')).toBe('/prices/rebar');
  });
});

describe('shouldNotFound — the %2F guard bypass (security regression)', () => {
  // `%2F` decodes to `/`, so the decoded form `/blog/aaa/bbb` matched no
  // guarded pattern and the guard declined to act. The request then fell
  // through to `/blog/[slug]`, where `notFound()` replies HTTP 200 and the
  // route's `revalidate` caches the ghost behind a ~365-day
  // stale-while-revalidate window — unlimited attacker-minted cacheable
  // pages, two Postgres reads and a full render each.
  it('404s a slug that splits itself into two segments with %2F', () => {
    expect(shouldNotFound('/blog/aaa%2Fbbb', known)).toBe(true);
    expect(shouldNotFound('/blog/aaa%2fbbb', known)).toBe(true);
    expect(shouldNotFound('/news/x%2Fy', known)).toBe(true);
    expect(shouldNotFound('/prices/x%2Fy', known)).toBe(true);
    expect(shouldNotFound('/blog/%2e%2e%2f%2e%2e%2fetc%2fpasswd', known)).toBe(true);
  });

  it('404s the same shape for the code-defined families', () => {
    expect(shouldNotFound('/tools/x%2Fy', known)).toBe(true);
    expect(shouldNotFound('/cooperation/x%2Fy', known)).toBe(true);
  });

  it('still lets a legitimately encoded known path through', () => {
    // `%2F` between real segments of a path that EXISTS must not 404 — the
    // decoded form is what `known` holds.
    expect(shouldNotFound('/prices/rebar%2Fdeformed', known)).toBe(false);
    expect(shouldNotFound('/prices/rebar/deformed', known)).toBe(false);
    expect(shouldNotFound('/blog/what-is-a3', known)).toBe(false);
  });

  it('still lets the RSS feeds through', () => {
    expect(shouldNotFound('/blog/rss.xml', known)).toBe(false);
    expect(shouldNotFound('/news/rss.xml', known)).toBe(false);
    expect(shouldNotFound('/blog/rss.xml/', known)).toBe(false);
  });

  it('404s an ENCODED spelling of a feed — which today is a 500', () => {
    // Only the canonical spelling is exempt. `/blog/rss%2Exml` reaches
    // `/blog/[slug]` and returns HTTP 500 from Next's own router (verified
    // against production: "Invariant app-page handler received invalid cache
    // entry APP_ROUTE", reported to GlitchTip). Guarding it turns an
    // unauthenticated 500-on-demand into a clean 404. Nothing links it.
    expect(shouldNotFound('/blog/rss%2Exml', known)).toBe(true);
    expect(shouldNotFound('/news/rss%2exml', known)).toBe(true);
  });

  it('still fails open when the catalog has not loaded', () => {
    expect(shouldNotFound('/blog/aaa%2Fbbb', new Set())).toBe(false);
    expect(shouldNotFound('/blog/aaa%2Fbbb', known, { redirectsLoaded: false })).toBe(false);
  });

  it('serves an archive page that exists and hard-404s one that does not', () => {
    // `/blog?page=999` used to answer 200 with "هنوز مطلبی منتشر نشده است" —
    // factually false, indexable, and with no pager on screen to get back.
    // `notFound()` and `redirect()` BOTH reply 200 from inside the matched
    // route in this Next version, so the guard is the only honest answer.
    expect(shouldNotFound('/blog/page/2', known)).toBe(false);
    expect(shouldNotFound('/blog/page/3', known)).toBe(true);
    expect(shouldNotFound('/news/page/2', known)).toBe(true);
    expect(shouldNotFound('/blog/page/abc', known)).toBe(true);
    expect(shouldNotFound('/blog/page/2%2F3', known)).toBe(true);
  });

  it('still fails open on the archive pages when the catalog is cold', () => {
    expect(shouldNotFound('/blog/page/999', new Set())).toBe(false);
  });
});

describe('getKnownPaths / invalidateKnownPaths', () => {
  beforeEach(() => {
    publicCatalogPaths.mockClear();
    publishedGuardPaths.mockClear();
    invalidateKnownPaths();
  });

  it('a fresh SKU is immediately visible to the guard after invalidateKnownPaths — the audit #12026 regression', async () => {
    // Confirmed live (2026-09-01, CI run 33518928535, e2e delete test):
    // `revalidateCatalog` cleared the ISR page cache but never this guard,
    // so a SKU created via the admin API hard-404'd through THIS module for
    // up to KNOWN_PATHS_TTL_MS even though the page itself would render it
    // fine. `getKnownPaths` must serve stale data inside the TTL (cheap, the
    // whole point of caching) and MUST refetch the moment
    // `invalidateKnownPaths` is called, regardless of how little time has
    // passed since the last load.
    publicCatalogPaths.mockResolvedValueOnce([]);
    publishedGuardPaths.mockResolvedValueOnce([]);
    const before = await getKnownPaths();
    expect(before.has('/prices/rebar/deformed/new-sku')).toBe(false);

    publicCatalogPaths.mockResolvedValueOnce(['/prices/rebar/deformed/new-sku']);
    publishedGuardPaths.mockResolvedValueOnce([]);
    invalidateKnownPaths();
    const after = await getKnownPaths();
    expect(after.has('/prices/rebar/deformed/new-sku')).toBe(true);
  });

  it('serves the cached set without refetching inside the TTL', async () => {
    publicCatalogPaths.mockResolvedValueOnce(['/prices/rebar']);
    publishedGuardPaths.mockResolvedValueOnce([]);
    await getKnownPaths();
    await getKnownPaths();
    expect(publicCatalogPaths).toHaveBeenCalledTimes(1);
  });

  it('fails open (keeps the last good set) when the DB read throws', async () => {
    publicCatalogPaths.mockResolvedValueOnce(['/prices/rebar']);
    publishedGuardPaths.mockResolvedValueOnce([]);
    const good = await getKnownPaths();
    expect(good.has('/prices/rebar')).toBe(true);

    invalidateKnownPaths();
    publicCatalogPaths.mockRejectedValueOnce(new Error('db down'));
    const stillGood = await getKnownPaths();
    expect(stillGood.has('/prices/rebar')).toBe(true);
  });
});
