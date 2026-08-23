// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';

/** Real local HTTP servers, not a mocked `fetch` — same reasoning as
 *  tgju.test.ts: `fetchJson` (utils/httpJson.ts) talks to `node:http(s)`
 *  directly to install a `dns.resolve4` lookup around a musl/Alpine bug, so
 *  mocking global `fetch` would test nothing real. A literal `127.0.0.1`
 *  skips DNS entirely (Node checks `net.isIP` before calling a custom
 *  `lookup`), so this exercises the real HTTP path hermetically. */
function startServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** The real response shape, captured live from
 *  /api/products/variations/prices/626 — `[unixSeconds, priceInRial]`. */
function pricesResponse(points: Array<[number, number]>) {
  return { success: true, data: points };
}

const AUG_22 = 1_787_402_579; // 2026-08-22T12:42:59Z, a real point from that feed

describe('fetchBilletPrice', () => {
  const servers: Array<() => Promise<void>> = [];

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    resetCircuitBreakers();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((close) => close()));
  });

  async function server(handler: http.RequestListener) {
    const s = await startServer(handler);
    servers.push(s.close);
    return s.url;
  }

  it('returns the newest point converted from Rial to Toman', async () => {
    const base = await server((_req, res) =>
      json(res, 200, pricesResponse([
        [AUG_22 - 86_400, 669_500],
        [AUG_22, 677_000],
      ])),
    );
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    // 677,000 ﷼ → 67,700 تومان/kg. A missing /10 here is the 155x-overcharge
    // class of bug: this number feeds auto-quoting downstream.
    expect(await fetchBilletPrice()).toBe(67_700);
  });

  it('takes the newest point even if the feed returns them out of order', async () => {
    const base = await server((_req, res) =>
      json(res, 200, pricesResponse([
        [AUG_22, 677_000],
        [AUG_22 - 86_400, 669_500],
      ])),
    );
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    expect(await fetchBilletPrice()).toBe(67_700);
  });

  it('requests the configured product with a source/destination window', async () => {
    let seenUrl = '';
    const base = await server((req, res) => {
      seenUrl = req.url ?? '';
      json(res, 200, pricesResponse([[AUG_22, 677_000]]));
    });
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    vi.stubEnv('ESFAHANAHAN_BILLET_PRODUCT_ID', '626');
    const { fetchBilletPrice } = await import('./esfahanahan');

    await fetchBilletPrice(new Date('2026-08-22T12:00:00Z'));
    expect(seenUrl).toContain('/api/products/variations/prices/626');
    const params = new URLSearchParams(seenUrl.slice(seenUrl.indexOf('?') + 1));
    // Tehran-local (UTC+3:30), unpadded components, space before the time —
    // the format their own frontend sends.
    expect(params.get('destination')).toBe('2026-8-22 15:30:00');
    expect(params.get('source')).toBe('2026-8-15 15:30:00');
  });

  it('returns null on an empty window rather than inventing a price', async () => {
    const base = await server((_req, res) => json(res, 200, pricesResponse([])));
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    expect(await fetchBilletPrice()).toBeNull();
  });

  it('returns null on an unexpected payload shape', async () => {
    const base = await server((_req, res) => json(res, 200, { success: false, message: 'nope' }));
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    expect(await fetchBilletPrice()).toBeNull();
  });

  it('returns null (never throws) on an outage — the ticker keeps its other keys', async () => {
    const base = await server((_req, res) => res.writeHead(503).end());
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    await expect(fetchBilletPrice()).resolves.toBeNull();
  });

  it('retries a transient 502 and succeeds on the next attempt', async () => {
    let attempts = 0;
    const base = await server((_req, res) => {
      attempts++;
      if (attempts === 1) return res.writeHead(502).end();
      json(res, 200, pricesResponse([[AUG_22, 677_000]]));
    });
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    expect(await fetchBilletPrice()).toBe(67_700);
    expect(attempts).toBe(2);
  });

  it('does not retry a 4xx — a wrong product id fails immediately', async () => {
    let attempts = 0;
    const base = await server((_req, res) => {
      attempts++;
      res.writeHead(404).end();
    });
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    expect(await fetchBilletPrice()).toBeNull();
    expect(attempts).toBe(1);
  });

  it('opens the circuit after repeated failures — a later call skips the network entirely', async () => {
    let attempts = 0;
    const base = await server((_req, res) => {
      attempts++;
      res.writeHead(500).end();
    });
    vi.stubEnv('ESFAHANAHAN_BASE_URL', base);
    const { fetchBilletPrice } = await import('./esfahanahan');

    // Each call retries twice internally (3 attempts); 3 calls crosses the
    // default failureThreshold of 3.
    for (let i = 0; i < 3; i++) await fetchBilletPrice();
    const attemptsSoFar = attempts;

    expect(await fetchBilletPrice()).toBeNull();
    expect(attempts).toBe(attemptsSoFar); // no new network attempt
  });
});
