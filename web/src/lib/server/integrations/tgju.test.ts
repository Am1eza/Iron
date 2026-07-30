// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';

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

function fetchRouter(handlers: Record<string, () => { ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  return vi.fn(async (url: string) => {
    for (const [needle, handler] of Object.entries(handlers)) {
      if (url.includes(needle)) return handler();
    }
    throw new Error(`unhandled fetch: ${url}`);
  });
}

describe('fetchTgju', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    resetCircuitBreakers();
  });

  it('fetches ounce even when TGJU_BASE_URL is unset — currency/gold are skipped, not the whole call', async () => {
    const fetchMock = fetchRouter({
      'gold-api.com': () => ({ ok: true, json: async () => ounceResponse(4100.5) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ ounce: 4100.5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('converts Rial to Toman unconditionally — NOT a magnitude guess (the actual regression this covers)', async () => {
    // Real-world scale: USD/EUR rial values sit well under 10M (the OLD
    // magnitude-based cutoff's threshold) while gold18 sits well over —
    // a size-based heuristic silently skips dividing the currency values.
    vi.stubEnv('TGJU_BASE_URL', 'http://tgju:8000');
    const fetchMock = fetchRouter({
      '/api/price/currency': () => ({ ok: true, json: async () => currencyResponse('1,924,000', '2,198,800') }),
      '/api/price/gold': () => ({ ok: true, json: async () => goldResponse('186,654,000') }),
      'gold-api.com': () => ({ ok: true, json: async () => ounceResponse(4100.5) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ usd: 192_400, eur: 219_880, gold18: 18_665_400, ounce: 4100.5 });
  });

  it('a gold-api.com outage does not prevent currency/gold from being reported', async () => {
    vi.stubEnv('TGJU_BASE_URL', 'http://tgju:8000');
    const fetchMock = fetchRouter({
      '/api/price/currency': () => ({ ok: true, json: async () => currencyResponse('1,924,000', '2,198,800') }),
      '/api/price/gold': () => ({ ok: true, json: async () => goldResponse('186,654,000') }),
      'gold-api.com': () => ({ ok: false, status: 500 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ usd: 192_400, eur: 219_880, gold18: 18_665_400 });
  });

  it('a tgju outage does not prevent ounce from being reported', async () => {
    vi.stubEnv('TGJU_BASE_URL', 'http://tgju:8000');
    const fetchMock = fetchRouter({
      '/api/price/currency': () => ({ ok: false, status: 500 }),
      '/api/price/gold': () => ({ ok: false, status: 500 }),
      'gold-api.com': () => ({ ok: true, json: async () => ounceResponse(4100.5) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ ounce: 4100.5 });
  });

  it('returns null when every source fails', async () => {
    const fetchMock = fetchRouter({
      'gold-api.com': () => ({ ok: false, status: 500 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    expect(await fetchTgju()).toBeNull();
  });

  it('retries a transient 502 and succeeds on the next attempt', async () => {
    let ounceAttempts = 0;
    const fetchMock = fetchRouter({
      'gold-api.com': () => {
        ounceAttempts++;
        return ounceAttempts === 1 ? { ok: false, status: 502 } : { ok: true, json: async () => ounceResponse(4100.5) };
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ ounce: 4100.5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx — fails immediately for that source', async () => {
    const fetchMock = fetchRouter({
      'gold-api.com': () => ({ ok: false, status: 401 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    expect(await fetchTgju()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated failures — a later call skips fetch entirely', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = fetchRouter({
        'gold-api.com': () => ({ ok: false, status: 500 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const { fetchTgju } = await import('./tgju');

      // Each call already retries twice internally (3 attempts); 3 calls
      // here is enough to cross the default failureThreshold of 3. The
      // internal backoff uses real setTimeout delays, so advance fake time
      // past them between calls instead of waiting in real time.
      for (let i = 0; i < 3; i++) {
        const p = fetchTgju();
        await vi.runAllTimersAsync();
        await p;
      }
      const callsSoFar = fetchMock.mock.calls.length;

      const out = await fetchTgju();
      expect(out).toBeNull();
      expect(fetchMock.mock.calls.length).toBe(callsSoFar); // no new network attempt
    } finally {
      vi.useRealTimers();
    }
  });
});
