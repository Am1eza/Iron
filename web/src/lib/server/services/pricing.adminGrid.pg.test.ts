// @vitest-environment node
/**
 * The admin pricing grid's read/write loop, against a real Postgres (pglite).
 *
 * Both cases below are the SAME production incident seen from two ends. Every
 * price in the live catalog was 28 days old, i.e. past
 * PRICE_STALE_HIDE_AFTER_DAYS — the point at which `getPriceFreshness`
 * WITHHOLDS the number so the public site says «تماس بگیرید» instead of
 * quoting a price nobody stands behind. That rule is correct for a customer
 * and catastrophic for the admin grid, which read through the very same
 * `tableRows()`:
 *
 *   1. every price cell rendered EMPTY, so the operator doing daily entry had
 *      no previous number to work from — on exactly the days (post-weekend,
 *      post-holiday, after any gap) when they most need one;
 *   2. `deliveryTime` was withheld to `''` too, and the grid submits
 *      `deliveryTime` on every dirty row — so saving a price silently
 *      overwrote «۴۸ ساعت» with an empty string, destroying the delivery-time
 *      promise the whole product is built around, for every row saved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { InvalidPriceError, PriceAnomalyError, PriceSyncExcludedError, PriceVersionConflictError, rollbackPrice, savePrice, savePrices } from './pricing.service';
import { ulid } from 'ulid';

let db: Db;
let close: () => Promise<void>;

const CAT = 'c-rebar';
const SUB = 's-plain';
const SKU = 'sku-rebar-14';
const ACTOR = 'u-admin-test';
/** Comfortably past PRICE_STALE_HIDE_AFTER_DAYS (2 business days). */
const LONG_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  // `current_prices.updated_by` is a real FK — savePrice writes the actor.
  await db.insert(schema.users).values({ id: ACTOR, mobile: '09120000009', name: 'مدیر', role: 'admin' });
  await db.insert(schema.categories).values({ id: CAT, slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' });
  await db.insert(schema.subCategories).values({ id: SUB, categoryId: CAT, slug: 'plain', name: 'ساده', order: 1 });
  await db.insert(schema.skus).values({
    id: SKU,
    categoryId: CAT,
    subCategoryId: SUB,
    slug: 'rebar-14',
    name: 'میلگرد ۱۴',
    size: '۱۴',
    unit: 'kg',
  });
  await db.insert(schema.currentPrices).values({
    skuId: SKU,
    price: 285_000,
    unit: 'kg',
    deliveryTime: '۴۸ ساعت',
    vatIncluded: false,
    movementPct: 1.5,
    movementDir: 'up',
    updatedAt: LONG_AGO,
    confirmedAt: LONG_AGO,
    isStale: true,
  });
}, 120_000);

afterAll(async () => {
  await close();
});

describe('tableRows — the public read still withholds a stale-hidden price', () => {
  it('hides the number from a customer-facing read', async () => {
    const [row] = await tableRows('rebar');
    expect(row!.current.priceHidden).toBe(true);
    expect(row!.current.price).toBe(0);
    expect(row!.current.deliveryTime).toBe('');
  });
});

describe('tableRows({ forAdmin }) — the admin grid must still see what it is editing', () => {
  it('returns the real price and delivery time, while STILL flagging it hidden', async () => {
    const [row] = await tableRows('rebar', undefined, { forAdmin: true });
    // The flag is what drives the «مخفی» badge — it must survive, or the
    // operator loses the signal that customers currently see «تماس بگیرید».
    expect(row!.current.priceHidden).toBe(true);
    expect(row!.current.isStale).toBe(true);
    // …but the operator gets a baseline to type against.
    expect(row!.current.price).toBe(285_000);
    expect(row!.current.deliveryTime).toBe('۴۸ ساعت');
    expect(row!.current.movementPct).toBe(1.5);
  });
});

describe('savePrice — an empty deliveryTime is "unchanged", never "erase it"', () => {
  it.each([0, -1, 1e13 + 1])('database constraints reject %s even without application validation', async (price) => {
    await expect(db.update(schema.currentPrices).set({ price }).where(eq(schema.currentPrices.skuId, SKU))).rejects.toThrow();
    await expect(db.insert(schema.pricePoints).values({ id: ulid(), skuId: SKU, price, unit: 'kg' })).rejects.toThrow();
  });
  it.each([0.1, 100.5, 1e13 + 1, NaN, Infinity])('refuses invalid money %s before a write', async (price) => {
    await expect(savePrice(ACTOR, { skuId: SKU, price })).rejects.toBeInstanceOf(InvalidPriceError);
  });
  it('keeps the stored delivery time when the payload carries an empty string', async () => {
    await savePrice(ACTOR, { skuId: SKU, price: 290_000, deliveryTime: '' });
    const rows = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    expect(rows[0]!.price).toBe(290_000);
    expect(rows[0]!.deliveryTime).toBe('۴۸ ساعت');
  });

  it('whitespace-only is treated the same way', async () => {
    await savePrice(ACTOR, { skuId: SKU, price: 291_000, deliveryTime: '   ' });
    const rows = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    expect(rows[0]!.deliveryTime).toBe('۴۸ ساعت');
  });

  it('a real value still writes through', async () => {
    await savePrice(ACTOR, { skuId: SKU, price: 292_000, deliveryTime: '۲۴ ساعت' });
    const rows = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    expect(rows[0]!.deliveryTime).toBe('۲۴ ساعت');
  });
  it('finds the earlier close behind more than thirty same-day points', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    await db.insert(schema.pricePoints).values({ id: ulid(), skuId: SKU, price: 200000, unit: 'kg', at: yesterday, confirmedAt: yesterday });
    await db.insert(schema.pricePoints).values(Array.from({ length: 40 }, () => ({ id: ulid(), skuId: SKU, price: 250000, unit: 'kg' as const, at: new Date() })));
    const result = await savePrice(ACTOR, { skuId: SKU, price: 220000 });
    expect(result.movementPct).toBe(10);
  });
  it('refuses a price stamped with a different selling unit', async () => {
    await expect(savePrice(ACTOR, { skuId: SKU, price: 220000, unit: 'branch' })).rejects.toBeInstanceOf(InvalidPriceError);
  });
  it('rejects both duplicate bulk rows without choosing a winner', async () => {
    const before = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    const results = await savePrices(ACTOR, [{ skuId: SKU, price: 300000 }, { skuId: SKU, price: 310000 }]);
    expect(results.every((row) => !row.ok)).toBe(true);
    const after = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    expect(after).toEqual(before);
  });
  it('rechecks the sync exclusion at the write boundary', async () => {
    await db.update(schema.skus).set({ priceSyncExcluded: true }).where(eq(schema.skus.id, SKU));
    try {
      await expect(savePrice(null, { skuId: SKU, price: 300000, respectSyncExclusion: true })).rejects.toBeInstanceOf(PriceSyncExcludedError);
      await expect(savePrice(ACTOR, { skuId: SKU, price: 300000 })).resolves.toMatchObject({ price: 300000 });
    } finally {
      await db.update(schema.skus).set({ priceSyncExcluded: false }).where(eq(schema.skus.id, SKU));
    }
  });
  it('does not refresh current price or append history for the same source event', async () => {
    const first = await savePrice(null, { skuId: SKU, price: 305000, source: 'sync:ahanonline', sourceEventKey: 'source:event:1' });
    const before = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    const pointsBefore = await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, SKU));
    const second = await savePrice(null, { skuId: SKU, price: 305000, source: 'sync:ahanonline', sourceEventKey: 'source:event:1' });
    const after = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    const pointsAfter = await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, SKU));
    expect(first.changed).toBe(true);
    expect(second).toMatchObject({ changed: false, version: first.version });
    expect(after[0]!.confirmedAt).toEqual(before[0]!.confirmedAt);
    expect(pointsAfter).toHaveLength(pointsBefore.length);
  });
  it('quarantines an order-of-magnitude typo unless explicitly confirmed', async () => {
    await expect(savePrice(ACTOR, { skuId: SKU, price: 3_050_000 })).rejects.toBeInstanceOf(PriceAnomalyError);
    await expect(savePrice(ACTOR, { skuId: SKU, price: 3_050_000, confirmAnomaly: true })).resolves.toMatchObject({ changed: true });
  });
  it('rolls back by appending, replays idempotently, and refuses a distinct stale rollback', async () => {
    const target = await savePrice(ACTOR, { skuId: SKU, price: 300000, confirmAnomaly: true });
    const latest = await savePrice(ACTOR, { skuId: SKU, price: 310000 });
    const restored = await rollbackPrice(ACTOR, { skuId: SKU, targetVersion: target.version, expectedCurrentVersion: latest.version });
    expect(restored).toMatchObject({ price: 300000, changed: true });
    await expect(rollbackPrice(ACTOR, { skuId: SKU, targetVersion: target.version, expectedCurrentVersion: latest.version }))
      .resolves.toMatchObject({ changed: false, price: 300000 });
    await expect(rollbackPrice(ACTOR, { skuId: SKU, targetVersion: latest.version, expectedCurrentVersion: latest.version }))
      .rejects.toBeInstanceOf(PriceVersionConflictError);
  });
  it('rolls back price, point and audit when atomic sync evidence cannot be inserted', async () => {
    const before = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU));
    const points = await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, SKU));
    await expect(savePrice(null, {
      skuId: SKU,
      price: 320000,
      source: 'sync:ahanonline',
      sourceEventKey: 'source:event:broken-log',
      syncEntry: {
        runId: 'missing-run', skuId: SKU, reason: 'write:exact', source: 'ahanonline', confidence: 'exact',
      },
    })).rejects.toThrow();
    expect(await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU))).toEqual(before);
    expect(await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, SKU))).toHaveLength(points.length);
  });
});
