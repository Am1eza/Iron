// @vitest-environment node
/**
 * estimateProject — the tool that has to turn «یه خونه می‌خوام بسازم» into
 * something a customer can actually buy.
 *
 * Two live failures on 2026-08-18 drive this file:
 *
 *  - «زیربنای ۵۰۰ متر که ۶ طبقه‌ای هست» was answered with **۹۶ تن**, because
 *    the function multiplied the stated زیربنا BY the storey count. That is
 *    192 kg per m² of the area the customer named — roughly triple the
 *    heaviest figure any published source gives for any building — and it
 *    was stated with no hedge and no assumption named.
 *  - The answer was one abstract tonnage. For a company whose business is
 *    selling steel, «۹۶ تن آهن لازم داری» is a dead end: there is no product,
 *    no mill and no next step in it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import type { Db } from '@/lib/server/db/client';
import { estimateProject, rebarKgPerM2, REBAR_MIX } from './estimate.service';
import { runTool } from './aiTools';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('rebarKgPerM2', () => {
  it('stays inside the band the published sources actually cover', () => {
    for (const floors of [1, 2, 3, 4, 5, 6, 10, 50]) {
      expect(rebarKgPerM2(floors)).toBeGreaterThanOrEqual(25);
      expect(rebarKgPerM2(floors)).toBeLessThanOrEqual(75);
    }
  });

  it('rises with storey count and then stops rising', () => {
    expect(rebarKgPerM2(1)).toBeLessThan(rebarKgPerM2(2));
    expect(rebarKgPerM2(3)).toBeLessThan(rebarKgPerM2(6));
    expect(rebarKgPerM2(50)).toBe(rebarKgPerM2(40));
  });

  it('brackets fooladiranian’s own worked example (۴۰۰ متر، ۴ طبقه → ۱۶ تن)', async () => {
    const e = await estimateProject(400, 4);
    expect(e.rebarKgLow).toBeLessThanOrEqual(16_000);
    expect(e.rebarKgHigh).toBeGreaterThanOrEqual(16_000);
  });
});

describe('estimateProject — what «زیربنا» means', () => {
  it('reads the area as the TOTAL across all floors by default', async () => {
    const e = await estimateProject(500, 6);
    expect(e.areaBasis).toBe('total');
    expect(e.totalAreaM2).toBe(500);
    expect(e.areaPerFloorM2).toBe(83);
  });

  it('never again answers 192 kg per m² of stated زیربنا', async () => {
    // The live bug, pinned as arithmetic rather than as a string.
    const e = await estimateProject(500, 6);
    expect(e.rebarKg / e.totalAreaM2).toBeLessThan(80);
    expect(e.rebarTons).toBeLessThan(50);
  });

  it('still multiplies when the caller genuinely means one floor', async () => {
    const perFloor = await estimateProject(500, 6, 'perFloor');
    expect(perFloor.totalAreaM2).toBe(3000);
    expect(perFloor.rebarKg).toBe((await estimateProject(3000, 6)).rebarKg);
  });

  it('refuses to answer when the reading implies an impossible floor', async () => {
    // 120m² spread over 10 floors is 12m² a floor — the number was misread,
    // and the honest move is a question, not a confident tonnage.
    const e = await estimateProject(120, 10);
    expect(e.areaWarning).toContain('کل زیربنای همهٔ طبقه‌ها');
  });

  it('flags an extrapolated rate above the highest published storey count', async () => {
    expect((await estimateProject(500, 3)).isExtrapolated).toBe(false);
    expect((await estimateProject(500, 8)).isExtrapolated).toBe(true);
  });
});

describe('estimateProject — the shopping list', () => {
  it('splits the tonnage into real diameters that add up to the total', async () => {
    const e = await estimateProject(500, 6);
    expect(e.lines).toHaveLength(REBAR_MIX.length);
    expect(e.lines.map((l) => l.sizeMm)).toEqual([20, 18, 16, 12]);
    const summed = e.lines.reduce((s, l) => s + l.kg, 0);
    // Rounding per line, so within a kilo per line of the whole.
    expect(Math.abs(summed - e.rebarKg)).toBeLessThanOrEqual(e.lines.length);
    expect(e.lines.reduce((s, l) => s + l.sharePct, 0)).toBe(100);
  });

  it('names a real catalog product for each line, ready for prepareProforma', async () => {
    const e = await estimateProject(500, 6);
    const orderable = e.lines.filter((l) => l.product);
    expect(orderable.length).toBeGreaterThan(0);
    for (const line of orderable) {
      expect(line.product).toContain('میلگرد');
      expect(line.factoryCount).toBeGreaterThan(0);
      // Whatever the product string is, the tool that turns words into a SKU
      // must be able to resolve it — otherwise the "shopping list" is a list
      // of things nobody can order.
      const draft = (await runTool(
        'prepareProforma',
        { items: [{ product: line.product, qty: line.kg, unit: 'kg' }] },
        null,
      )) as { status?: string; error?: string };
      expect(draft.error).toBeUndefined();
      expect(['awaiting_user_confirmation', 'needs_choice']).toContain(draft.status);
    }
  });

  it('picks the cheapest mill per diameter when a price exists', async () => {
    const e = await estimateProject(500, 6);
    const priced = e.lines.filter((l) => typeof l.pricePerKg === 'number');
    expect(priced.length).toBeGreaterThan(0);
    for (const line of priced) {
      expect(line.cheapestFactory).toBeTruthy();
      expect(line.product).toContain(line.cheapestFactory!);
      expect(line.lineToman).toBe(Math.round(line.pricePerKg! * line.kg));
    }
  });

  it('scales every line with the building, not just the headline', async () => {
    const small = await estimateProject(250, 6);
    const big = await estimateProject(500, 6);
    for (let i = 0; i < big.lines.length; i++) {
      expect(big.lines[i]!.kg).toBeGreaterThan(small.lines[i]!.kg);
    }
  });
});

describe('the estimateProject tool', () => {
  it('tells the model to state its assumption and to end on a پیش‌فاکتور', async () => {
    const result = (await runTool('estimateProject', { areaM2: 500, floors: 6 }, null)) as {
      note: string;
      lines: unknown[];
    };
    expect(result.note).toContain('کل زیربنای همهٔ طبقه‌ها');
    expect(result.note).toContain('محاسب سازه');
    expect(result.note).toContain('پیش‌فاکتور');
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it('asks instead of answering when the area reading is not believable', async () => {
    const result = (await runTool('estimateProject', { areaM2: 120, floors: 10 }, null)) as { note: string };
    expect(result.note).toContain('بپرس');
  });

  it('honours an explicit per-floor basis from the model', async () => {
    const result = (await runTool(
      'estimateProject',
      { areaM2: 500, floors: 6, areaBasis: 'perFloor' },
      null,
    )) as { totalAreaM2: number; note: string };
    expect(result.totalAreaM2).toBe(3000);
    expect(result.note).toContain('مساحت هر طبقه');
  });
});
