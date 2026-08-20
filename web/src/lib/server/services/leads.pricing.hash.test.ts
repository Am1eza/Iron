// @vitest-environment node
/**
 * What filling `theoretical_weight_kg` on the ten priced هاش SKUs actually
 * does to a quote.
 *
 * This is the one change in the 2026-08-20 pass with a money-path
 * consequence, and the consequence the owner approved was stated as «these
 * rows become allPriced=true-eligible, i.e. they can auto-quote into a
 * پیش‌فاکتور without a human». That turns out NOT to be what happens, and the
 * difference is worth a test rather than a paragraph: هاش SKUs carry
 * `unit = 'kg'`, where تیرآهن — the other line in the same `ibeam` category —
 * carries `unit = 'branch'`. The unit, not the weight, is what decides.
 *
 * So the two cases below are the whole behaviour change:
 *
 *   · a kg-counted order was ALREADY auto-quoted and still is, at exactly the
 *     same total — `lineWeightKg('kg', 'kg', qty)` returns `qty` and never
 *     reads the weight column at all;
 *   · a branch-counted order still goes to a human either way (`unitMismatch`
 *     withholds `unitPrice`), but now carries its REAL mass on the line
 *     instead of none, so the پیش‌فاکتور's «وزن کل» stops under-counting.
 *
 * The third test is the guard: it pins that a هاش branch line does NOT
 * acquire a `lineTotal`. If someone later flips هاش to `unit = 'branch'` —
 * which IS the change that would make it branch-auto-quotable — this test
 * fails and that decision has to be taken deliberately.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { priceItems } from './leads.service';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

/** «تیرآهن هاش سنگین (HEB) ۲۰ ذوب‌آهن اصفهان» as it is stored live:
 *  163,636 تومان per kilogram, unit kg, basis kg. `weight` is what this pass
 *  writes — 736 kg over the 12 m branch (مرکزآهن 2026-08-20, DIN 1025-2
 *  61.3 kg/m × 12 = 735.6). Pass null to reproduce the state before it. */
const HEB20_PRICE_PER_KG = 163_636;
const HEB20_BRANCH_KG = 736;

async function seedHeb20(weight: number | null): Promise<string> {
  const catId = ulid();
  const subId = ulid();
  const skuId = ulid();
  await db.insert(schema.categories).values({ id: catId, slug: `ibeam-${catId}`, name: 'تیرآهن' });
  await db
    .insert(schema.subCategories)
    .values({ id: subId, categoryId: catId, slug: `hash-sangin-${subId}`, name: 'هاش سنگین' });
  await db.insert(schema.skus).values({
    id: skuId,
    subCategoryId: subId,
    categoryId: catId,
    slug: `sku-${skuId}`,
    name: 'تیرآهن هاش سنگین (HEB) ۲۰',
    size: '۲۰',
    factory: 'ذوب‌آهن اصفهان',
    unit: 'kg',
    priceBasis: 'kg',
    branchLengthM: weight === null ? null : 12,
    theoreticalWeightKg: weight,
  });
  await db
    .insert(schema.currentPrices)
    .values({ skuId, price: HEB20_PRICE_PER_KG, unit: 'kg', priceBasis: 'kg' });
  return skuId;
}

describe('هاش quoting, before and after the weight is filled', () => {
  it('quotes a kilogram order identically — the weight column is not in that path', async () => {
    const before = await seedHeb20(null);
    const after = await seedHeb20(HEB20_BRANCH_KG);

    const b = await priceItems([{ skuId: before, qty: 2_000, unit: 'kg' }]);
    const a = await priceItems([{ skuId: after, qty: 2_000, unit: 'kg' }]);

    // Already auto-quotable BEFORE this pass — the brief's premise that these
    // rows «route to a human today» does not hold for a kg-counted order.
    expect(b.allPriced).toBe(true);
    expect(a.allPriced).toBe(true);
    expect(a.lines[0]!.lineTotal).toBe(b.lines[0]!.lineTotal);
    // 2,000 kg × 163,636 = 327,272,000 تومان, unchanged by the weight.
    expect(a.lines[0]!.lineTotal).toBe(2_000 * HEB20_PRICE_PER_KG);
    expect(a.lines[0]!.weightKg).toBe(2_000);
  });

  it('gives a branch order its real mass, where before it had none', async () => {
    const before = await seedHeb20(null);
    const after = await seedHeb20(HEB20_BRANCH_KG);

    const b = await priceItems([{ skuId: before, qty: 5, unit: 'branch' }]);
    const a = await priceItems([{ skuId: after, qty: 5, unit: 'branch' }]);

    // Before: no weight to convert through, so the SKU's own unit overrules
    // the claim and the line reports no mass at all.
    expect(b.lines[0]!.unit).toBe('kg');
    expect(b.lines[0]!.weightKg).toBe(5);

    // After: «۵ شاخه» stays five branches and weighs 5 × 736 = 3,680 kg —
    // 736× what the line said before, which is the under-count this fixes.
    expect(a.lines[0]!.unit).toBe('branch');
    expect(a.lines[0]!.weightKg).toBe(5 * HEB20_BRANCH_KG);
  });

  it('still refuses to put a price on that branch order — both before and after', async () => {
    // The guard. `unitMismatch` (item.unit !== sku.unit) withholds unitPrice
    // regardless of the weight, so filling it cannot auto-issue a پیش‌فاکتور
    // for a branch-counted هاش line. Flipping هاش to unit='branch' would
    // change that; this test is what makes that a deliberate decision.
    const after = await seedHeb20(HEB20_BRANCH_KG);
    const { lines, allPriced } = await priceItems([{ skuId: after, qty: 5, unit: 'branch' }]);
    expect(allPriced).toBe(false);
    expect(lines[0]!.unitPrice).toBeUndefined();
    expect(lines[0]!.lineTotal).toBeUndefined();
  });

  it('HEA ۲۴ keeps its null weight, so a branch order stays massless', async () => {
    // The one row of the ten whose two sources disagree (مرکزآهن 702 vs DIN
    // 1025-3's 723.6 — 3.0 %). It is priced and live, and deliberately has no
    // weight, so it behaves exactly as every هاش row did before this pass.
    const heldRow = await seedHeb20(null);
    const { lines, allPriced } = await priceItems([{ skuId: heldRow, qty: 5, unit: 'branch' }]);
    expect(allPriced).toBe(false);
    expect(lines[0]!.lineTotal).toBeUndefined();
  });
});
