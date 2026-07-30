// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';

/** Real local HTTP servers, not a mocked `fetch` — `fetchJson` (tgju.ts)
 *  talks to `node:http`/`node:https` directly (see its header comment for
 *  why: a custom DNS `lookup` works around a musl/Alpine bug that broke
 *  gold-api.com resolution in production), so mocking global `fetch` would
 *  test nothing real. A literal `127.0.0.1` skips DNS lookup entirely
 *  (Node checks `net.isIP` before ever calling a custom `lookup`), so this
 *  exercises the actual HTTP-handling code path hermetically. */
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

/** Matches the real self-hosted scraper's shape, confirmed against its
 *  source (routers/price.py + schemas/price.py) — Rial-denominated
 *  comma-grouped price strings. /gold is an array of CATEGORIES, each with
 *  its own `prices[]` (one category per table on tgju.org's gold-chart
 *  page) — not a single flat object. */
function currencyResponse(usdRial: string, eurRial: string) {
  return [
    { title: 'دلار', price: usdRial, key: 'price_dollar_rl', status: 'low', low_price: null, high_price: null },
    { title: 'یورو', price: eurRial, key: 'price_eur', status: 'low', low_price: null, high_price: null },
  ];
}
function goldResponse(gold18Rial: string) {
  return [
    {
      title: 'قیمت طلا',
      prices: [{ title: 'طلای ۱۸ عیار', price: gold18Rial, key: 'geram18', status: 'low', low_price: null, high_price: null }],
    },
  ];
}
function ounceResponse(usd: number) {
  return { currency: 'USD', symbol: 'XAU', name: 'Gold', price: usd, updatedAt: '2026-07-30T00:00:00Z' };
}

describe('fetchTgju', () => {
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

  it('fetches ounce even when TGJU_BASE_URL is unset — currency/gold are skipped, not the whole call', async () => {
    const ounceUrl = await server((_req, res) => json(res, 200, ounceResponse(4100.5)));
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ ounce: 4100.5 });
  });

  it('converts Rial to Toman unconditionally — NOT a magnitude guess (the actual regression this covers)', async () => {
    // Real-world scale: USD/EUR rial values sit well under 10M (the OLD
    // magnitude-based cutoff's threshold) while gold18 sits well over —
    // a size-based heuristic silently skips dividing the currency values.
    const base = await server((req, res) => {
      if (req.url === '/api/price/currency') return json(res, 200, currencyResponse('1,924,000', '2,198,800'));
      if (req.url === '/api/price/gold') return json(res, 200, goldResponse('186,654,000'));
      res.writeHead(404).end();
    });
    const ounceUrl = await server((_req, res) => json(res, 200, ounceResponse(4100.5)));
    vi.stubEnv('TGJU_BASE_URL', base);
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ usd: 192_400, eur: 219_880, gold18: 18_665_400, ounce: 4100.5 });
  });

  it('an ounce-source outage does not prevent currency/gold from being reported', async () => {
    const base = await server((req, res) => {
      if (req.url === '/api/price/currency') return json(res, 200, currencyResponse('1,924,000', '2,198,800'));
      if (req.url === '/api/price/gold') return json(res, 200, goldResponse('186,654,000'));
      res.writeHead(404).end();
    });
    const ounceUrl = await server((_req, res) => res.writeHead(500).end());
    vi.stubEnv('TGJU_BASE_URL', base);
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ usd: 192_400, eur: 219_880, gold18: 18_665_400 });
  });

  it('a tgju outage does not prevent ounce from being reported', async () => {
    const base = await server((_req, res) => res.writeHead(500).end());
    const ounceUrl = await server((_req, res) => json(res, 200, ounceResponse(4100.5)));
    vi.stubEnv('TGJU_BASE_URL', base);
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ ounce: 4100.5 });
  });

  it('returns null when every source fails', async () => {
    const ounceUrl = await server((_req, res) => res.writeHead(500).end());
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    expect(await fetchTgju()).toBeNull();
  });

  it('retries a transient 502 and succeeds on the next attempt', async () => {
    let attempts = 0;
    const ounceUrl = await server((_req, res) => {
      attempts++;
      if (attempts === 1) return res.writeHead(502).end();
      json(res, 200, ounceResponse(4100.5));
    });
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ ounce: 4100.5 });
    expect(attempts).toBe(2);
  });

  it('does not retry a 4xx — fails immediately for that source', async () => {
    let attempts = 0;
    const ounceUrl = await server((_req, res) => {
      attempts++;
      res.writeHead(401).end();
    });
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    expect(await fetchTgju()).toBeNull();
    expect(attempts).toBe(1);
  });

  it('opens the circuit after repeated failures — a later call skips fetch entirely', async () => {
    let attempts = 0;
    const ounceUrl = await server((_req, res) => {
      attempts++;
      res.writeHead(500).end();
    });
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchTgju } = await import('./tgju');

    // Each call already retries twice internally (3 attempts); 3 calls
    // here is enough to cross the default failureThreshold of 3.
    for (let i = 0; i < 3; i++) await fetchTgju();
    const attemptsSoFar = attempts;

    const out = await fetchTgju();
    expect(out).toBeNull();
    expect(attempts).toBe(attemptsSoFar); // no new network attempt
  });
});
