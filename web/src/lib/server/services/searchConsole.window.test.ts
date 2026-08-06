// @vitest-environment node
/**
 * The pure parts of the Search Console service (US-14.4): the reporting window
 * and the page URL Google is asked about.
 *
 * Both are the kind of thing that fails SILENTLY in production — a window off
 * by a day still returns plausible rows, and a page URL built against the
 * wrong origin returns an empty result set that is indistinguishable from
 * "nobody has found this page yet", while the run still records success. So
 * they get pinned here rather than discovered later.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const ORIGINAL = { ...process.env };

/**
 * `NEXT_PUBLIC_SITE_URL` is read at MODULE scope by the service, so a case
 * that changes it has to get a fresh module registry — otherwise the first
 * import in the file wins for every case after it. (`GSC_SITE_URL` is read
 * per call and would not need this; loading both the same way keeps the tests
 * from depending on which is which.)
 */
async function loadService() {
  vi.resetModules();
  return import('./searchConsole.service');
}

beforeEach(() => {
  process.env = { ...ORIGINAL };
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('reportingWindow', () => {
  it('ends LAG_DAYS before "now" — Search Console data is not settled yet', async () => {
    const { reportingWindow, LAG_DAYS } = await loadService();
    const now = new Date('2026-08-05T12:00:00Z');
    const w = reportingWindow(now);
    expect(w.endDate).toBe('2026-08-02');
    expect(LAG_DAYS).toBe(3);
  });

  it('spans exactly WINDOW_DAYS days INCLUSIVE of both endpoints', async () => {
    const { reportingWindow, WINDOW_DAYS } = await loadService();
    const w = reportingWindow(new Date('2026-08-05T12:00:00Z'));
    const days = Math.round((w.end.getTime() - w.start.getTime()) / 86_400_000) + 1;
    // Subtracting a full WINDOW_DAYS gave 29 days of data under a constant
    // that says 28 — Google treats startDate and endDate as inclusive.
    expect(days).toBe(WINDOW_DAYS);
    expect(w.startDate).toBe('2026-07-06');
  });

  it('formats the dates in UTC, not the server timezone', async () => {
    const { reportingWindow } = await loadService();
    // 23:30 UTC is already the next day in Tehran; the window must not move.
    expect(reportingWindow(new Date('2026-08-05T23:30:00Z')).endDate).toBe('2026-08-02');
  });
});

describe('absolutePageUrl', () => {
  it('builds against the site origin when the property is a sc-domain one', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ahantime.com';
    process.env.GSC_SITE_URL = 'sc-domain:ahantime.com';
    const { absolutePageUrl } = await loadService();
    expect(absolutePageUrl('/blog/x')).toBe('https://ahantime.com/blog/x');
  });

  it('builds against the PROPERTY when it is a URL-prefix one', async () => {
    // The silent-zero case: a property verified as www.* while the app
    // advertises the apex matches no rows at all, and the run still reports
    // success.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ahantime.com';
    process.env.GSC_SITE_URL = 'https://www.ahantime.com/';
    const { absolutePageUrl } = await loadService();
    expect(absolutePageUrl('/blog/x')).toBe('https://www.ahantime.com/blog/x');
  });

  it('does not double-encode an already-encoded Persian slug', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ahantime.com';
    delete process.env.GSC_SITE_URL;
    const { absolutePageUrl } = await loadService();
    const encoded = encodeURIComponent('راهنمای-میلگرد');
    expect(absolutePageUrl(`/blog/${encoded}`)).toBe(`https://ahantime.com/blog/${encoded}`);
  });
});

describe('searchConsoleStatus with no credentials', () => {
  it('reports unconfigured and unconnected instead of throwing', async () => {
    delete process.env.GSC_CLIENT_ID;
    delete process.env.GSC_CLIENT_SECRET;
    delete process.env.GSC_SITE_URL;
    const { searchConsoleStatus } = await loadService();
    const status = await searchConsoleStatus();
    expect(status.configured).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.lastError).toBeNull();
  });
});
