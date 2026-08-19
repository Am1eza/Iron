/**
 * Safety tests for `public/sw.js`.
 *
 * The service worker is a real service-worker script, not a module, so it
 * can't be imported. It IS just JavaScript though, so this loads the shipped
 * file verbatim and runs it against a fake `ServiceWorkerGlobalScope`, then
 * drives its `fetch` listener with synthetic events.
 *
 * The assertion that matters is the negative one: for anything outside the
 * allowlist the handler must never call `respondWith`, which is what leaves
 * the request entirely to the browser. ahantime serves live prices — a
 * regression that quietly starts caching HTML, an API response or an RSC
 * payload would show customers stale numbers, so it needs a test that fails
 * loudly rather than a code comment.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SW_SOURCE = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const ORIGIN = 'https://ahantime.com';

type Listener = (event: FakeEvent) => void;
type FakeEvent = {
  request: FakeRequest;
  respondWith: (v: unknown) => void;
  waitUntil: (v: unknown) => void;
};
type FakeRequest = {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: { get: (k: string) => string | null };
};

let listeners: Record<string, Listener>;

function loadWorker() {
  listeners = {};
  const self = {
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const caches = {
    keys: () => Promise.resolve([] as string[]),
    delete: () => Promise.resolve(true),
    open: () =>
      Promise.resolve({
        match: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
        keys: () => Promise.resolve([] as unknown[]),
        delete: () => Promise.resolve(true),
      }),
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, () => Promise.resolve());
}

function request(path: string, overrides: Partial<FakeRequest> = {}): FakeRequest {
  const headers = new Map<string, string>();
  return {
    url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
    method: 'GET',
    mode: 'no-cors',
    destination: 'script',
    headers: { get: (k) => headers.get(k) ?? null },
    ...overrides,
  };
}

/** @returns true if the worker took over the request. */
function intercepts(req: FakeRequest): boolean {
  let handled = false;
  const event: FakeEvent = {
    request: req,
    respondWith: () => {
      handled = true;
    },
    waitUntil: () => {},
  };
  const fetchListener = listeners.fetch;
  if (!fetchListener) throw new Error('sw.js registered no fetch listener');
  fetchListener(event);
  return handled;
}

beforeEach(loadWorker);

describe('sw.js — what it handles', () => {
  it('registers install, activate and fetch listeners', () => {
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install']);
  });

  it.each([
    '/_next/static/chunks/app/layout-abc123.js',
    '/_next/static/css/deadbeef.css',
    '/_next/static/media/Vazirmatn.var-abc.woff2',
    '/brand/icon-192.png',
    '/fonts/Vazirmatn.var.woff2',
    '/assets/logos/mark.svg',
  ])('handles the immutable/static asset %s', (path) => {
    expect(intercepts(request(path))).toBe(true);
  });
});

describe('sw.js — what it must never touch', () => {
  it.each([
    ['a page navigation', request('/prices/rebar', { mode: 'navigate', destination: 'document' })],
    ['an API response', request('/api/prices')],
    ['an admin API route', request('/api/admin/leads')],
    ['an admin page asset', request('/admin/leads')],
    ['an RSC payload for a page', request('/prices?_rsc=1a2b')],
    ['a product photo', request('/products/rebar.webp')],
    ['an admin upload', request('/uploads/invoice-2026.pdf')],
    ['the hero video', request('/media/hero.webm')],
    ['the optimizer endpoint', request('/_next/image?url=%2Fproducts%2Frebar.webp')],
    ['the root document', request('/', { mode: 'navigate', destination: 'document' })],
    ['a cross-origin request', request('https://tgju.org/rates.json')],
    ['a non-GET request', request('/_next/static/chunks/x.js', { method: 'POST' })],
  ])('leaves %s to the browser', (_case, req) => {
    expect(intercepts(req)).toBe(false);
  });

  it('leaves an RSC request alone even when its path looks static', () => {
    // Next marks an RSC payload request only by header — the URL can be the
    // same as the page's. A path-only check would miss this entirely.
    const req = request('/_next/static/chunks/x.js', {
      headers: { get: (k) => (k === 'RSC' ? '1' : null) },
    });
    expect(intercepts(req)).toBe(false);
  });

  it('leaves a router prefetch alone', () => {
    const req = request('/_next/static/chunks/x.js', {
      headers: { get: (k) => (k === 'Next-Router-Prefetch' ? '1' : null) },
    });
    expect(intercepts(req)).toBe(false);
  });
});
