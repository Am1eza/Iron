// @vitest-environment node
/**
 * Integration test for the compareFactories AI tool (the site's signature
 * «مقایسهٔ کارخانه‌ها» capability) against a real seeded pglite — including
 * the priceHidden-exclusion guard: toPriceRow stores a hidden/stale price as
 * a literal 0, and a naive average would let that "free" row win as
 * cheapest, so this MUST be verified against the real DB shape, not a hand
 * -built fixture that could accidentally not exercise the bug.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { runTool } from '@/lib/server/services/aiTools';

type CompareResult = {
  category: string;
  tonnage: number;
  cheapestFactory: string;
  cheapestPricePerKg: number;
  cheapestTotalToman: number;
  factories: { factory: string; pricePerKg: number; totalToman: number }[];
};
type ErrorResult = { error: string };

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 5 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('compareFactories tool', () => {
  it('resolves a free-text Persian category name and finds the real cheapest factory', async () => {
    const rows = await tableRows('rebar');
    const byFactory = new Map<string, number[]>();
    for (const r of rows) if (r.factory) byFactory.get(r.factory)?.push(r.current.price) ?? byFactory.set(r.factory, [r.current.price]);
    const expectedCheapest = [...byFactory.entries()]
      .map(([f, prices]) => [f, prices.reduce((s, p) => s + p, 0) / prices.length] as const)
      .sort((a, b) => a[1] - b[1])[0]![0];

    const r = (await runTool('compareFactories', { category: 'میلگرد', tonnage: 20 }, null)) as CompareResult;
    expect(r.category).toBe('میلگرد');
    expect(r.tonnage).toBe(20);
    expect(r.cheapestFactory).toBe(expectedCheapest);
    expect(r.cheapestTotalToman).toBe(Math.round(r.cheapestPricePerKg * 20_000));
    expect(r.factories.length).toBeGreaterThan(1);
  });

  it('resolves the bare slug too, and an optional sub-category narrows the rows', async () => {
    const r = (await runTool('compareFactories', { category: 'rebar', sub: 'ساده', tonnage: 5 }, null)) as CompareResult;
    expect(r.cheapestFactory).toBeTruthy();
  });

  it('an unknown category name errors rather than silently comparing the wrong product', async () => {
    const r = (await runTool('compareFactories', { category: 'چیز نامربوط بدون معنی', tonnage: 10 }, null)) as ErrorResult;
    expect(r.error).toBeTruthy();
  });

  it('a hidden/stale price (stored as 0) never wins as "cheapest" (the free-product bug)', async () => {
    const rows = await tableRows('ibeam');
    const target = rows[0]!;
    // Push this row's price far enough into the past to cross isHidden's
    // threshold (PRICE_STALE_HIDE_AFTER_DAYS) — toPriceRow then reports it
    // as price:0, priceHidden:true, exactly like a real stale row.
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.update(schema.currentPrices).set({ updatedAt: longAgo }).where(eq(schema.currentPrices.skuId, target.id));

    const hiddenRow = (await tableRows('ibeam')).find((r) => r.id === target.id)!;
    expect(hiddenRow.current.priceHidden).toBe(true);
    expect(hiddenRow.current.price).toBe(0);

    const r = (await runTool('compareFactories', { category: 'تیرآهن', tonnage: 15 }, null)) as CompareResult;
    // The hidden row's factory must not be crowned cheapest by virtue of a
    // fake 0 price, and every reported price must be real (> 0).
    expect(r.cheapestPricePerKg).toBeGreaterThan(0);
    for (const f of r.factories) expect(f.pricePerKg).toBeGreaterThan(0);
  });
});

describe('getPrice tool', () => {
  it('dates every result with a Jalali updatedAt so a stale price can be quoted with its date', async () => {
    const r = (await runTool('getPrice', { query: 'میلگرد ۱۴' }, null)) as {
      results: Array<{ price: number | null; isStale: boolean; updatedAtJalali: string }>;
    };
    expect(r.results.length).toBeGreaterThan(0);
    for (const row of r.results) {
      // Persian-digit yyyy/MM/dd — the exact pattern the grounding validator
      // exempts as a date, so quoting it can never trip the censor.
      expect(row.updatedAtJalali).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
    }
  });
});
