// @vitest-environment node
/**
 * P2 integration — catalog reads, the savePrice transaction (movement +
 * history + audit atomically) and market upserts, on a seeded pglite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { listCategories, tableRows, findSkuRow, skuHistory, searchSkus } from '@/lib/server/repos/catalogRepo';
import { savePrice, savePrices, recomputeStaleness } from '@/lib/server/services/pricing.service';
import { upsertMarketValue, listMarketValues, flagTgjuStale } from '@/lib/server/repos/marketRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 5 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('catalog reads', () => {
  it('lists the 7 seeded categories in order', async () => {
    const cats = await listCategories();
    expect(cats).toHaveLength(7);
    expect(cats[0]!.slug).toBe('rebar');
  });

  it('serves PriceRow tables with slugs in categoryId/subCategoryId (link contract)', async () => {
    const rows = await tableRows('rebar');
    expect(rows.length).toBeGreaterThan(10);
    const r = rows[0]!;
    expect(r.categoryId).toBe('rebar');
    expect(['deformed', 'deformed-a2', 'plain', 'coil', 'stirrup', 'alloy']).toContain(r.subCategoryId);
    expect(r.current.price).toBeGreaterThan(0);
    expect(r.current.priceHidden).toBe(false);
  });

  it('filters by sub-category', async () => {
    const rows = await tableRows('rebar', 'plain');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.subCategoryId === 'plain')).toBe(true);
  });

  it('finds a SKU by slug with history', async () => {
    const rows = await tableRows('rebar');
    const row = await findSkuRow(rows[0]!.slug);
    expect(row?.slug).toBe(rows[0]!.slug);
    const points = await skuHistory(rows[0]!.slug, '7d');
    expect(points.length).toBeGreaterThan(0);
  });

  it('searches by name/factory substring', async () => {
    const hits = await searchSkus('میلگرد');
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('savePrice transaction', () => {
  it('computes movement, appends history, audits — atomically', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[0]!;
    const prev = sku.current.price;

    const pointsBefore = await db.select({ n: sql<number>`count(*)::int` })
      .from(schema.pricePoints).where(eq(schema.pricePoints.skuId, sku.id));

    const result = await savePrice('u-admin', { skuId: sku.id, price: prev + 1000, deliveryTime: '۲۴ ساعت' });
    expect(result.movementDir).toBe('up');
    expect(result.movementPct).toBeCloseTo((1000 / prev) * 100, 1);

    const pointsAfter = await db.select({ n: sql<number>`count(*)::int` })
      .from(schema.pricePoints).where(eq(schema.pricePoints.skuId, sku.id));
    expect(pointsAfter[0]!.n).toBe(pointsBefore[0]!.n + 1);

    const audits = await db.select().from(schema.auditEntries)
      .where(eq(schema.auditEntries.entityId, sku.id));
    expect(audits.some((a) => a.action === 'price.update')).toBe(true);

    const fresh = await findSkuRow(sku.slug);
    expect(fresh!.current.price).toBe(prev + 1000);
    expect(fresh!.current.isStale).toBe(false);
  });

  it('flags yesterday-priced SKUs stale (Jalali day window)', async () => {
    const rows = await tableRows('ibeam');
    const sku = rows[0]!;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.update(schema.currentPrices)
      .set({ updatedAt: twoDaysAgo })
      .where(eq(schema.currentPrices.skuId, sku.id));

    const flagged = await recomputeStaleness();
    expect(flagged).toBeGreaterThan(0);

    const fresh = await findSkuRow(sku.slug);
    expect(fresh!.current.isStale).toBe(true);
  });

  it('bulk save isolates a bad row — every other row still commits (EC-M1.3)', async () => {
    const rows = await tableRows('rebar');
    const [good1, good2] = rows;
    const results = await savePrices('u-admin', [
      { skuId: good1!.id, price: good1!.current.price + 500 },
      { skuId: 'sku-does-not-exist', price: 10_000 },
      { skuId: good2!.id, price: good2!.current.price + 700 },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ ok: true, skuId: good1!.id });
    expect(results[1]).toMatchObject({ ok: false, skuId: 'sku-does-not-exist' });
    expect(results[2]).toMatchObject({ ok: true, skuId: good2!.id });

    const refreshed1 = await findSkuRow(good1!.slug);
    const refreshed2 = await findSkuRow(good2!.slug);
    expect(refreshed1!.current.price).toBe(good1!.current.price + 500);
    expect(refreshed2!.current.price).toBe(good2!.current.price + 700);
  });
});

describe('market values', () => {
  it('upserts with movement and appends history', async () => {
    const before = (await listMarketValues()).find((v) => v.key === 'usd')!;
    const updated = await upsertMarketValue({ key: 'usd', value: before.value + 500, source: 'tgju' });
    expect(updated.movementDir).toBe('up');
    expect(updated.isStale).toBe(false);
  });

  it('flags tgju rows stale on outage, keeping last-known values', async () => {
    await flagTgjuStale();
    const values = await listMarketValues();
    const usd = values.find((v) => v.key === 'usd')!;
    const billet = values.find((v) => v.key === 'billet')!;
    expect(usd.isStale).toBe(true);
    expect(usd.value).toBeGreaterThan(0); // last-known survives
    expect(billet.isStale).toBe(false); // admin rows untouched
  });
});
