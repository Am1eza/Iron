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
import { savePrice } from './pricing.service';

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
});
