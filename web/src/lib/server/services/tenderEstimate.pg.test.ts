// @vitest-environment node
/**
 * Tender estimate — the two things that decide real money on a quote:
 *  1) each row defaults to the CHEAPEST factory (and a factory with no live
 *     price is offered but sinks to the bottom, never invented), and
 *  2) the whole-tender total = Σ(day price × weight) + VAT, using the SKU's
 *     OWN unit (a non-kg product must NOT come back falsely «استعلام» — the
 *     unit-mismatch trap in priceItems that `priceTender` resolves around).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { factoryOptionsFor, priceTender } from './tenderEstimate';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '', isActive: true },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-plain', categoryId: 'c-rebar', slug: 'plain', name: 'ساده', order: 1, isActive: true },
    { id: 's-solo', categoryId: 'c-rebar', slug: 'solo', name: 'تک‌کارخانه', order: 2, isActive: true },
  ]);
  // Three factories for the same product+size 14 (unit branch, 10kg/branch):
  // cheap (28k), pricey (30k), and one with NO price row at all.
  const sku = (id: string, subId: string, factory: string, size: string) => ({
    id,
    subCategoryId: subId,
    categoryId: 'c-rebar',
    slug: id,
    name: `میلگرد ${factory} ${size}`,
    size,
    factory,
    theoreticalWeightKg: 10,
    unit: 'branch' as const,
    isActive: true,
  });
  await db.insert(schema.skus).values([
    sku('rebar-cheap', 's-plain', 'کارخانهٔ ب', '14'),
    sku('rebar-pricey', 's-plain', 'کارخانهٔ الف', '14'),
    sku('rebar-noprice', 's-plain', 'کارخانهٔ ج', '14'),
    sku('rebar-solo', 's-solo', 'کارخانهٔ تنها', '16'),
  ]);
  await db.insert(schema.currentPrices).values([
    { skuId: 'rebar-cheap', price: 28_000, unit: 'branch' },
    { skuId: 'rebar-pricey', price: 30_000, unit: 'branch' },
    { skuId: 'rebar-solo', price: 50_000, unit: 'branch' },
    // rebar-noprice: intentionally no row → «استعلام»
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('factoryOptionsFor', () => {
  it('sorts cheapest-first, flags the cheapest, sinks the unpriced', async () => {
    const opts = await factoryOptionsFor('rebar', 'plain', '14');
    expect(opts.map((o) => o.skuId)).toEqual(['rebar-cheap', 'rebar-pricey', 'rebar-noprice']);
    expect(opts[0]!.cheapest).toBe(true);
    expect(opts[1]!.cheapest).toBe(false);
    // The no-price factory is offered but carries a null price (never invented).
    const noprice = opts.find((o) => o.skuId === 'rebar-noprice')!;
    expect(noprice.unitPrice).toBeNull();
    expect(noprice.cheapest).toBe(false);
    // Weight per unit rides along for the UI.
    expect(opts[0]!.weightKgPerUnit).toBe(10);
  });

  it('a single-factory product yields one option, marked cheapest', async () => {
    const opts = await factoryOptionsFor('rebar', 'solo', '16');
    expect(opts).toHaveLength(1);
    expect(opts[0]!.skuId).toBe('rebar-solo');
    expect(opts[0]!.cheapest).toBe(true);
  });
});

describe('priceTender', () => {
  it('totals day-price × weight over rows, with VAT, using the SKU unit', async () => {
    const q = await priceTender([
      { skuId: 'rebar-cheap', qty: 5 },
      { skuId: 'rebar-pricey', qty: 2 },
    ]);
    // A non-kg (branch) product must be priced, not falsely «استعلام».
    expect(q.allPriced).toBe(true);
    const cheap = q.lines[0]!;
    expect(cheap.weightKg).toBe(50); // 5 × 10kg
    expect(cheap.unitPrice).toBe(28_000);
    expect(cheap.lineTotal).toBe(140_000); // 28k × 5
    expect(q.subtotal).toBe(200_000); // 140k + 60k
    // VAT + grand total are internally consistent with whatever the rate is.
    expect(q.vatAmount).toBe(Math.round(q.subtotal * q.vatRate));
    expect(q.grandTotal).toBe(q.subtotal + q.vatAmount);
  });

  it('marks the tender not-fully-priced when any row lacks a live price', async () => {
    const q = await priceTender([
      { skuId: 'rebar-cheap', qty: 1 },
      { skuId: 'rebar-noprice', qty: 3 },
    ]);
    expect(q.allPriced).toBe(false);
    const noprice = q.lines.find((l) => l.skuId === 'rebar-noprice')!;
    expect(noprice.priced).toBe(false);
    expect(noprice.lineTotal).toBeUndefined();
    // The priced row still contributes to the subtotal.
    expect(q.subtotal).toBe(28_000);
  });
});
