// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';

/** Real local HTTP servers, not a mocked `fetch` — `fetchJson`
 *  (marketRates.ts) talks to `node:http`/`node:https` directly (see its
 *  header comment for why: a custom DNS `lookup` works around a musl/Alpine
 *  bug that broke gold-api.com resolution in production), so mocking global
 *  `fetch` would test nothing real. A literal `127.0.0.1` skips DNS lookup
 *  entirely (Node checks `net.isIP` before ever calling a custom `lookup`),
 *  so this exercises the actual HTTP-handling code path hermetically. */
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

/** Matches BrsAPI's real response shape (confirmed live, 2026-08-26) — a
 *  single combined object with `gold[]` and `currency[]`, each item
 *  {symbol, price, unit: "تومان", ...}. Values are already Toman, unlike
 *  the old Rial-denominated scraper. */
function brsapiResponse(usdToman: number | string, eurToman: number | string, gold18Toman: number | string) {
  return {
    gold: [{ symbol: 'IR_GOLD_18K', name_en: '18K Gold', price: gold18Toman, unit: 'تومان' }],
    currency: [
      { symbol: 'USD', name_en: 'US Dollar', price: usdToman, unit: 'تومان' },
      { symbol: 'EUR', name_en: 'Euro', price: eurToman, unit: 'تومان' },
    ],
  };
}
function ounceResponse(usd: number) {
  return { currency: 'USD', symbol: 'XAU', name: 'Gold', price: usd, updatedAt: '2026-07-30T00:00:00Z' };
}

describe('fetchMarketRates', () => {
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

  it('fetches ounce even when BRSAPI_KEY is unset — domestic rates are skipped, not the whole call', async () => {
    const ounceUrl = await server((_req, res) => json(res, 200, ounceResponse(4100.5)));
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    const out = await fetchMarketRates();
    expect(out).toEqual({ ounce: 4100.5 });
  });

  it('reads usd/eur/gold18 straight through — already Toman, no /10 conversion (the actual regression the old scraper needed a guard for)', async () => {
    const brsapiUrl = await server((_req, res) => json(res, 200, brsapiResponse(192_400, 219_880, 18_665_400)));
    const ounceUrl = await server((_req, res) => json(res, 200, ounceResponse(4100.5)));
    vi.stubEnv('BRSAPI_KEY', 'test-key');
    vi.stubEnv('BRSAPI_URL', brsapiUrl);
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    const out = await fetchMarketRates();
    expect(out).toEqual({ usd: 192_400, eur: 219_880, gold18: 18_665_400, ounce: 4100.5 });
  });

  it('an ounce-source outage does not prevent domestic rates from being reported', async () => {
    const brsapiUrl = await server((_req, res) => json(res, 200, brsapiResponse(192_400, 219_880, 18_665_400)));
    const ounceUrl = await server((_req, res) => res.writeHead(500).end());
    vi.stubEnv('BRSAPI_KEY', 'test-key');
    vi.stubEnv('BRSAPI_URL', brsapiUrl);
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    const out = await fetchMarketRates();
    expect(out).toEqual({ usd: 192_400, eur: 219_880, gold18: 18_665_400 });
  });

  it('a brsapi outage does not prevent ounce from being reported', async () => {
    const brsapiUrl = await server((_req, res) => res.writeHead(500).end());
    const ounceUrl = await server((_req, res) => json(res, 200, ounceResponse(4100.5)));
    vi.stubEnv('BRSAPI_KEY', 'test-key');
    vi.stubEnv('BRSAPI_URL', brsapiUrl);
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    const out = await fetchMarketRates();
    expect(out).toEqual({ ounce: 4100.5 });
  });

  it('returns null when every source fails', async () => {
    const ounceUrl = await server((_req, res) => res.writeHead(500).end());
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    expect(await fetchMarketRates()).toBeNull();
  });

  it('retries a transient 502 and succeeds on the next attempt', async () => {
    let attempts = 0;
    const ounceUrl = await server((_req, res) => {
      attempts++;
      if (attempts === 1) return res.writeHead(502).end();
      json(res, 200, ounceResponse(4100.5));
    });
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    const out = await fetchMarketRates();
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
    const { fetchMarketRates } = await import('./marketRates');

    expect(await fetchMarketRates()).toBeNull();
    expect(attempts).toBe(1);
  });

  it('opens the circuit after repeated failures — a later call skips fetch entirely', async () => {
    let attempts = 0;
    const ounceUrl = await server((_req, res) => {
      attempts++;
      res.writeHead(500).end();
    });
    vi.stubEnv('OUNCE_API_URL', ounceUrl);
    const { fetchMarketRates } = await import('./marketRates');

    // Each call already retries twice internally (3 attempts); 3 calls
    // here is enough to cross the default failureThreshold of 3.
    for (let i = 0; i < 3; i++) await fetchMarketRates();
    const attemptsSoFar = attempts;

    const out = await fetchMarketRates();
    expect(out).toBeNull();
    expect(attempts).toBe(attemptsSoFar); // no new network attempt
  });
});
