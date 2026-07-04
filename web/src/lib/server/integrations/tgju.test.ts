// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';

describe('fetchTgju', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    resetCircuitBreakers();
  });

  it('returns null without calling fetch when TGJU_BASE_URL is unset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    expect(await fetchTgju()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a flat rate map on the first successful attempt', async () => {
    vi.stubEnv('TGJU_BASE_URL', 'https://relay.example/rates');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ usd: 58000, eur: 63000, gold18: 3850000, ounce: 2380 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ usd: 58000, eur: 63000, gold18: 3850000, ounce: 2380 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 502 and succeeds on the next attempt', async () => {
    vi.stubEnv('TGJU_BASE_URL', 'https://relay.example/rates');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ usd: 58000 }) });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    const out = await fetchTgju();
    expect(out).toEqual({ usd: 58000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx — fails immediately and returns null', async () => {
    vi.stubEnv('TGJU_BASE_URL', 'https://relay.example/rates');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTgju } = await import('./tgju');

    expect(await fetchTgju()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated failures — a later call skips fetch entirely', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('TGJU_BASE_URL', 'https://relay.example/rates');
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
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
