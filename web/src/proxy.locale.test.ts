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

describe('proxy — the panel host never gets locale-rewritten', () => {
  it('a bare panel-host path is untouched by locale logic', async () => {
    const res = await proxy(req('/leads', 'panel.ahantime.com'));
    const target = rewriteTarget(res);
    // Panel routing rewrites /leads → /admin/leads (a DIFFERENT mechanism);
    // it must never also pick up a /fa prefix.
    if (target) expect(target).not.toMatch(/^\/(fa|en|ar|zh)(\/|$)/);
  });
});
