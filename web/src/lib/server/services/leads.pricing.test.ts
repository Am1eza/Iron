// @vitest-environment node
/** priceItems — the function that decides what a customer is quoted.
 *
 *  Everything on a line is recomputed server-side EXCEPT, until this was
 *  fixed, `unit`, which was taken from the request on trust while `unitPrice`
 *  came from the SKU. The two could therefore describe different things and
 *  the resulting proforma is issued, frozen and SMS'd to the customer. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { priceItems } from './leads.service';
import type { PriceUnit } from '@/lib/types/domain';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

const PRICE_PER_UNIT = 42_000;

/** A per-`unit` SKU priced at 42,000 Toman, one branch weighing 12kg. */
async function seedSku(unit: PriceUnit): Promise<string> {
  const catId = ulid();
  const subId = ulid();
  const skuId = ulid();
  await db.insert(schema.categories).values({ id: catId, slug: `cat-${catId}`, name: 'میلگرد' });
  await db
    .insert(schema.subCategories)
    .values({ id: subId, categoryId: catId, slug: `sub-${subId}`, name: 'آجدار' });
  await db.insert(schema.skus).values({
    id: skuId,
    subCategoryId: subId,
    categoryId: catId,
    slug: `sku-${skuId}`,
    name: 'میلگرد ۱۴',
    unit,
    theoreticalWeightKg: 12,
  });
  await db.insert(schema.currentPrices).values({ skuId, price: PRICE_PER_UNIT, unit });
  return skuId;
}

describe('priceItems — the unit is the SKU’s, not the client’s', () => {
  it('prices normally when the client agrees with the SKU', async () => {
    const skuId = await seedSku('kg');
    const { lines, allPriced } = await priceItems([{ skuId, qty: 100, unit: 'kg' }]);
    expect(allPriced).toBe(true);
    expect(lines[0]!.unit).toBe('kg');
    expect(lines[0]!.lineTotal).toBe(100 * PRICE_PER_UNIT);
    expect(lines[0]!.weightKg).toBe(100);
  });

  it('refuses to auto-quote a per-kg SKU claimed as branches', async () => {
    // The original bug: this returned lineTotal = 100 x 42,000 = 4,200,000 on
    // a document reading «۱۰۰ شاخه», when 100 branches is ~1200kg — about 12x
    // under, on a binding quote the customer keeps.
    const skuId = await seedSku('kg');
    const { lines, allPriced } = await priceItems([{ skuId, qty: 100, unit: 'branch' }]);
    expect(allPriced).toBe(false);
    expect(lines[0]!.unitPrice).toBeUndefined();
    expect(lines[0]!.lineTotal).toBeUndefined();
  });

  it('reads «۱۰۰ شاخه» of a per-kg SKU as 100 branches, not as 100 kilograms', async () => {
    // The live report (2026-08-18): the advisor computed «۲۰ شاخه × ۱۴٫۵۲
    // کیلوگرم = ۲۹۰٫۳۷ کیلوگرم» and the confirmation card under it said «وزن
    // کل ۲۰ کیلوگرم». Overriding the piece unit with the SKU's 'kg' made the
    // shaft count BE the mass. The piece unit is kept and converted instead.
    const skuId = await seedSku('kg'); // 12kg per branch
    const { lines } = await priceItems([{ skuId, qty: 100, unit: 'branch' }]);
    expect(lines[0]!.unit).toBe('branch');
    expect(lines[0]!.weightKg).toBe(1200);
  });

  it('keeps overruling a claimed unit it cannot convert', async () => {
    // No theoreticalWeightKg means there is no defensible piece→kg
    // conversion, so the SKU's own unit still wins (and the line is unpriced).
    const catId = ulid();
    const subId = ulid();
    const skuId = ulid();
    await db.insert(schema.categories).values({ id: catId, slug: `cat-${catId}`, name: 'میلگرد' });
    await db.insert(schema.subCategories).values({ id: subId, categoryId: catId, slug: `sub-${subId}`, name: 'آجدار' });
    await db.insert(schema.skus).values({
      id: skuId,
      subCategoryId: subId,
      categoryId: catId,
      slug: `sku-${skuId}`,
      name: 'میلگرد بدون وزن تئوری',
      unit: 'kg',
      theoreticalWeightKg: null,
    });
    await db.insert(schema.currentPrices).values({ skuId, price: PRICE_PER_UNIT, unit: 'kg' });

    const { lines, allPriced } = await priceItems([{ skuId, qty: 100, unit: 'branch' }]);
    expect(lines[0]!.unit).toBe('kg');
    expect(allPriced).toBe(false);
  });

  it('refuses the mirrored error, which corrupts weight instead of price', async () => {
    const skuId = await seedSku('branch');
    const { lines, allPriced } = await priceItems([{ skuId, qty: 100, unit: 'kg' }]);
    expect(allPriced).toBe(false);
    expect(lines[0]!.unit).toBe('branch');
    // weight comes from the SKU's theoretical weight, not from qty-as-kg
    expect(lines[0]!.weightKg).toBe(1200);
  });

  it('rejects a fractional quantity of a piece-sold unit on the create path', async () => {
    // «۳٫۷ شاخه» is a typo, not an order. The admin edit path already refused
    // it; creation did not.
    const skuId = await seedSku('branch');
    const { lines, allPriced } = await priceItems([{ skuId, qty: 3.7, unit: 'branch' }]);
    expect(allPriced).toBe(false);
    expect(lines[0]!.lineTotal).toBeUndefined();
  });

  it('still allows a fractional quantity where it is a real amount', async () => {
    const skuId = await seedSku('kg');
    const { lines, allPriced } = await priceItems([{ skuId, qty: 2500.5, unit: 'kg' }]);
    expect(allPriced).toBe(true);
    expect(lines[0]!.lineTotal).toBe(Math.round(2500.5 * PRICE_PER_UNIT));
  });

  it('leaves an unresolvable SKU unpriced rather than guessing', async () => {
    const { lines, allPriced } = await priceItems([{ skuId: 'no-such-sku', qty: 5, unit: 'kg' }]);
    expect(allPriced).toBe(false);
    expect(lines[0]!.unitPrice).toBeUndefined();
  });

  it('charges a piece-priced (branch) SKU by real weight, not raw quantity', async () => {
    // `unitPrice` is per KILOGRAM regardless of `unit` (see PriceTable's
    // «تومان / کیلوگرم» label) — for a branch SKU, `qty` counts branches, so
    // lineTotal must be unitPrice × (qty × theoreticalWeightKg), not
    // unitPrice × qty. This is the audit-2026-08-08 fix: `weightKg` was
    // already computed correctly here but `lineTotal` ignored it, silently
    // charging by piece-count as if it were kilograms.
    const skuId = await seedSku('branch'); // 42,000/kg, 12kg/branch
    const { lines, allPriced } = await priceItems([{ skuId, qty: 5, unit: 'branch' }]);
    expect(allPriced).toBe(true);
    expect(lines[0]!.weightKg).toBe(60); // 5 × 12kg
    expect(lines[0]!.lineTotal).toBe(60 * PRICE_PER_UNIT); // NOT 5 × 42,000
  });

  it('does not auto-quote a priced branch SKU with no theoreticalWeightKg on file', async () => {
    // unitPrice can be set while weightKg (and therefore lineTotal) cannot be
    // computed — allPriced must key off lineTotal, not unitPrice alone, or a
    // proforma could auto-issue with a line silently worth 0.
    const catId = ulid();
    const subId = ulid();
    const skuId = ulid();
    await db.insert(schema.categories).values({ id: catId, slug: `cat-${catId}`, name: 'میلگرد' });
    await db.insert(schema.subCategories).values({ id: subId, categoryId: catId, slug: `sub-${subId}`, name: 'آجدار' });
    await db.insert(schema.skus).values({
      id: skuId,
      subCategoryId: subId,
      categoryId: catId,
      slug: `sku-${skuId}`,
      name: 'میلگرد بدون وزن',
      unit: 'branch',
      theoreticalWeightKg: null,
    });
    await db.insert(schema.currentPrices).values({ skuId, price: PRICE_PER_UNIT, unit: 'branch' });

    const { lines, allPriced } = await priceItems([{ skuId, qty: 5, unit: 'branch' }]);
    expect(lines[0]!.unitPrice).toBe(PRICE_PER_UNIT);
    expect(lines[0]!.weightKg).toBeUndefined();
    expect(lines[0]!.lineTotal).toBeUndefined();
    expect(allPriced).toBe(false);
  });
});
