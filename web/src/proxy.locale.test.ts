// @vitest-environment node
/**
 * I-07/I-08: proxy.ts's URL-locale rewrite — Persian (default) stays bare in
 * the browser but is rewritten internally to `/fa/...` so Next's router finds
 * `app/[locale]/...`; every other locale's URL already names its segment and
 * needs no rewrite. `hasDb()` is false without DATABASE_URL, so the redirect/
 * known-paths branches never touch a real DB here — same setup as
 * proxy.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));

import { proxy } from './proxy';

function req(pathname: string, host = 'ahantime.com') {
  // NextRequest does not derive a `Host` header from the URL's own hostname —
  // `isPanelHost`/`resolvePanelRouting` read `req.headers.get('host')`
  // explicitly, so it must be set here the same way a real proxied request
  // would carry it.
  return new NextRequest(`http://${host}${pathname}`, { headers: { host } });
}

function rewriteTarget(res: Response): string | null {
  const raw = res.headers.get('x-middleware-rewrite');
  if (!raw) return null;
  return new URL(raw).pathname;
}

describe('proxy — default-locale (fa) internal rewrite', () => {
  it('rewrites a bare public path to /fa/... internally, browser URL untouched by the response itself', async () => {
    const res = await proxy(req('/about'));
    expect(rewriteTarget(res)).toBe('/fa/about');
  });

  it('rewrites the bare root to exactly /fa (not /fa/)', async () => {
    const res = await proxy(req('/'));
    expect(rewriteTarget(res)).toBe('/fa');
  });

  it('rewrites a nested catalog path', async () => {
    const res = await proxy(req('/prices/rebar/deformed'));
    expect(rewriteTarget(res)).toBe('/fa/prices/rebar/deformed');
  });
});

describe('proxy — explicitly locale-prefixed requests pass through unrewritten', () => {
  it.each(['/en/about', '/ar/about', '/zh/about'])('%s is not rewritten again', async (path) => {
    const res = await proxy(req(path));
    expect(rewriteTarget(res)).toBeNull();
  });
});

describe('proxy — locale-exempt prefixes are never rewritten to /fa/...', () => {
  it.each(['/admin', '/admin/leads', '/api/ai/chat', '/panel-login', '/uploads/x.jpg'])(
    '%s stays outside [locale]',
    async (path) => {
      const res = await proxy(req(path));
      const target = rewriteTarget(res);
      // Some of these get rewritten for OTHER reasons (e.g. /admin on the
      // public host → /__admin_denied__) — the only thing under test here is
      // that none of them is ever sent under /fa/... or /en/....
      if (target) expect(target).not.toMatch(/^\/(fa|en|ar|zh)(\/|$)/);
    },
  );
});

/**
 * `app/layout.tsx` renders `<html lang dir>` from the REQUEST header set here,
 * and `Content-Language` is the response-side twin of that attribute. Both
 * were the fix for /en, /ar and /zh pages being served `lang="fa" dir="rtl"`,
 * so both are pinned: dropping either silently re-declares every translated
 * page Persian to any crawler, with nothing else failing.
 */
describe('proxy — the locale a page renders in is declared on both sides', () => {
  /** `NextResponse.next({ request: { headers } })` surfaces overridden request
   *  headers to the app as `x-middleware-request-*`. */
  function forwardedLocale(res: Response): string | null {
    return res.headers.get('x-middleware-request-x-next-intl-locale');
  }

  it.each([
    ['/', 'fa'],
    ['/about', 'fa'],
    ['/prices/rebar/deformed', 'fa'],
  ])('%s forwards locale %s and declares it', async (path, locale) => {
    const res = await proxy(req(path));
    expect(forwardedLocale(res)).toBe(locale);
    expect(res.headers.get('content-language')).toBe(locale);
  });

  it.each([
    ['/en/about', 'en'],
    ['/ar/about', 'ar'],
    ['/zh/about', 'zh'],
    ['/en/prices/rebar', 'en'],
  ])('%s forwards locale %s and declares it', async (path, locale) => {
    const res = await proxy(req(path));
    expect(forwardedLocale(res)).toBe(locale);
    expect(res.headers.get('content-language')).toBe(locale);
  });

  it('the panel host is never given a locale to render in', async () => {
    const res = await proxy(req('/leads', 'panel.ahantime.com'));
    expect(forwardedLocale(res)).toBeNull();
    expect(res.headers.get('content-language')).toBeNull();
  });
});

describe('proxy — the panel host never gets locale-rewritten', () => {
  it('a bare panel-host path is untouched by locale logic', async () => {
    const res = await proxy(req('/leads', 'panel.ahantime.com'));
    const target = rewriteTarget(res);
    // Panel routing rewrites /leads → /admin/leads (a DIFFERENT mechanism);
    // it must never also pick up a /fa prefix.
    if (target) expect(target).not.toMatch(/^\/(fa|en|ar|zh)(\/|$)/);
  });
});
