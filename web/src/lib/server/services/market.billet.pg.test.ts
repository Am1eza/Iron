// @vitest-environment node
/**
 * `refreshBillet()` — the billet (شمش فولاد) feed added 1405/06/01, replacing
 * admin-only entry after the value sat at 60,800 تومان/kg for a week against a
 * real 66,750–67,700.
 *
 * The upstream HTTP call is covered hermetically in
 * integrations/esfahanahan.test.ts; this file covers the DB-facing policy:
 * what gets written, what an outage does, and when a hand-entered override
 * survives a poll.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestDb } from '@/test/db';
import { marketValues } from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { upsertMarketValue, getMarketValue } from '@/lib/server/repos/marketRepo';

const fetchBilletPrice = vi.hoisted(() => vi.fn<() => Promise<number | null>>());
vi.mock('@/lib/server/integrations/esfahanahan', () => ({ fetchBilletPrice }));

import { refreshBillet } from './market.service';

let db: Db;
let close: () => Promise<void>;

const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 60_000);
afterAll(async () => {
  await close();
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  fetchBilletPrice.mockReset();
  await db.delete(marketValues);
});

describe('refreshBillet', () => {
  it('writes the fetched price with source=esfahanahan', async () => {
    fetchBilletPrice.mockResolvedValue(67_700);

    expect(await refreshBillet()).toEqual({ status: 'updated', value: 67_700 });
    const row = await getMarketValue('billet');
    expect(row).toMatchObject({ value: 67_700, source: 'esfahanahan', unit: 'تومان', label: 'شمش فولاد', isStale: false });
  });

  it('an outage keeps the last-known value and flags the row stale (AC-A-2)', async () => {
    fetchBilletPrice.mockResolvedValue(67_700);
    await refreshBillet();

    fetchBilletPrice.mockResolvedValue(null);
    expect(await refreshBillet()).toEqual({ status: 'stale' });

    const row = await getMarketValue('billet');
    expect(row?.value).toBe(67_700); // last-known survives — never zeroed, never dropped
    expect(row?.isStale).toBe(true);
  });

  it('an outage does NOT badge a hand-entered value stale — the feed being down says nothing about it', async () => {
    // Old enough that the admin hold has expired, so this is purely about the
    // outage path, not the hold.
    await upsertMarketValue({ key: 'billet', value: 66_900, source: 'admin' });
    await db.update(marketValues).set({ updatedAt: new Date(Date.now() - 48 * HOUR) });
    fetchBilletPrice.mockResolvedValue(null);

    expect(await refreshBillet()).toEqual({ status: 'stale' });
    const row = await getMarketValue('billet');
    expect(row?.isStale).toBe(false);
    expect(row?.value).toBe(66_900);
  });

  it('holds a fresh admin override instead of overwriting it', async () => {
    await upsertMarketValue({ key: 'billet', value: 66_900, source: 'admin' });
    fetchBilletPrice.mockResolvedValue(67_700);

    expect(await refreshBillet()).toEqual({ status: 'held', value: 66_900 });
    expect(fetchBilletPrice).not.toHaveBeenCalled(); // no pointless upstream hit either
    expect((await getMarketValue('billet'))?.value).toBe(66_900);
  });

  it('takes the feed back over once the hold has expired — an override cannot strand the ticker', async () => {
    await upsertMarketValue({ key: 'billet', value: 66_900, source: 'admin' });
    await db.update(marketValues).set({ updatedAt: new Date(Date.now() - 7 * HOUR) }); // hold is 6h
    fetchBilletPrice.mockResolvedValue(67_700);

    expect(await refreshBillet()).toEqual({ status: 'updated', value: 67_700 });
    const row = await getMarketValue('billet');
    expect(row).toMatchObject({ value: 67_700, source: 'esfahanahan' });
  });

  it('BILLET_ADMIN_HOLD_HOURS=0 disables the hold entirely', async () => {
    vi.stubEnv('BILLET_ADMIN_HOLD_HOURS', '0');
    await upsertMarketValue({ key: 'billet', value: 66_900, source: 'admin' });
    fetchBilletPrice.mockResolvedValue(67_700);

    expect(await refreshBillet()).toEqual({ status: 'updated', value: 67_700 });
  });

  it('a feed value never disturbs the other four keys', async () => {
    await upsertMarketValue({ key: 'usd', value: 192_400, source: 'tgju' });
    fetchBilletPrice.mockResolvedValue(null);

    await refreshBillet();

    const usd = await getMarketValue('usd');
    expect(usd?.isStale).toBe(false); // only the esfahanahan-sourced row is flagged
    expect(usd?.value).toBe(192_400);
  });
});
