// @vitest-environment node
/**
 * The automated price mirror end-to-end, against a real Postgres (pglite),
 * with the competitor fetch stubbed.
 *
 * These are the assertions that matter most, because this job writes prices
 * customers buy against with nobody watching:
 *
 *   1. a confident match actually lands in `current_prices`, and lands the way
 *      a hand-typed price does — `is_stale=false`, a `price_points` row, an
 *      audit entry — because a "fresh" price that still reads as stale would
 *      be withheld from the public site anyway;
 *   2. a SKU flagged `price_sync_excluded` is NOT touched, even when the
 *      matcher would have been perfectly confident about it. That flag is the
 *      only thing standing between a deliberate manual price and the next
 *      twice-daily run;
 *   3. every SKU the run considered leaves a log row with a reason — the
 *      mechanism the owner is relying on to catch a bad write after the fact.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { runPriceSync } from './priceSync.service';

let db: Db;
let close: () => Promise<void>;

const CAT = 'c-rebar';
const SUB = 's-deformed';
/** Exact factory + size match on the stub page — should be written. */
const SKU_MATCH = 'sku-shahin-14';
/** Same, but opted out by an admin — must be left alone. */
const SKU_EXCLUDED = 'sku-shahin-16';
/** A mill the stub page does not carry — should be skipped, not guessed. */
const SKU_OTHER_MILL = 'sku-faiko-14';

const OLD_PRICE = 40_000;
/** 2026-08-22 12:30 Tehran = Jalali 1405/05/31, matching the fixture's own
 *  «تاریخ بروزرسانی» so the source-freshness check is deterministic. */
const NOW = new Date('2026-08-22T09:00:00Z');

function priceRow(opts: { size: string; rial: string; shown: string; code: string; group: string }): string {
  return `
    </tbody></table>
    <div class="font-Bold text-[18px]">${opts.group}</div>
    <table>
      <thead><tr><th>سایز</th><th>واحد</th><th>محل تحویل</th><th>تاریخ بروزرسانی</th><th>قیمت (تومان)</th></tr></thead>
      <tbody>
      <tr>
        <td>${opts.size}</td><td>کیلوگرم</td><td>کارخانه</td><td>1405/5/31</td>
        <td><div class="product-price" data-price="${opts.rial}">${opts.shown}</div></td>
      </tr>`;
}

const PAGE = `<table><tbody>
${priceRow({ group: 'میلگرد شاهین بناب', size: '14', rial: '710000', shown: '71,000', code: 'a' })}
${priceRow({ group: 'میلگرد شاهین بناب', size: '16', rial: '705000', shown: '70,500', code: 'b' })}
</tbody></table>${'x'.repeat(6000)}`;

const stubFetch = {
  fetchImpl: (async () => new Response(PAGE, { status: 200 })) as unknown as typeof fetch,
  sleepImpl: () => Promise.resolve(),
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values({ id: CAT, slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' });
  await db
    .insert(schema.subCategories)
    .values({ id: SUB, categoryId: CAT, slug: 'deformed', name: 'میلگرد آجدار', order: 1 });

  const base = { categoryId: CAT, subCategoryId: SUB, unit: 'kg' as const, priceBasis: 'kg' as const, isActive: true };
  await db.insert(schema.skus).values([
    { ...base, id: SKU_MATCH, slug: 'rebar-14-shahin', name: 'میلگرد ۱۴ شاهین بناب', size: '۱۴', factory: 'شاهین بناب' },
    {
      ...base,
      id: SKU_EXCLUDED,
      slug: 'rebar-16-shahin',
      name: 'میلگرد ۱۶ شاهین بناب',
      size: '۱۶',
      factory: 'شاهین بناب',
      priceSyncExcluded: true,
    },
    { ...base, id: SKU_OTHER_MILL, slug: 'rebar-14-faiko', name: 'میلگرد ۱۴ فایکو', size: '۱۴', factory: 'فایکو' },
  ]);
  await db.insert(schema.currentPrices).values(
    [SKU_MATCH, SKU_EXCLUDED, SKU_OTHER_MILL].map((skuId) => ({
      skuId,
      price: OLD_PRICE,
      unit: 'kg' as const,
      priceBasis: 'kg' as const,
      isStale: true,
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })),
  );
});

afterAll(async () => {
  await close();
});

describe('runPriceSync', () => {
  it('mirrors a confident match and reports what it did', async () => {
    const summary = await runPriceSync({ trigger: 'manual', force: true, now: NOW, fetch: stubFetch });

    expect(summary.status).toBe('ok');
    expect(summary.consideredSkus).toBe(3);
    expect(summary.written).toBe(1);
    expect(summary.skipped).toBe(2);

    const [price] = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU_MATCH));
    expect(price!.price).toBe(71_000);
    // A mirrored price must read as FRESH — `getPriceFreshness` withholds a
    // stale price from the public site entirely, so a stale-flagged "update"
    // would leave the page saying «تماس بگیرید» after a successful sync.
    expect(price!.isStale).toBe(false);
    // System write, no staff account behind it.
    expect(price!.updatedBy).toBeNull();
  });

  it('goes through the real price write path — history and audit, not a raw UPDATE', async () => {
    const points = await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, SKU_MATCH));
    expect(points).toHaveLength(1);
    expect(points[0]!.price).toBe(71_000);

    const audit = await db.select().from(schema.auditEntries).where(eq(schema.auditEntries.entityId, SKU_MATCH));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe('price.update');
    expect(audit[0]!.actorId).toBeNull();
  });

  it('leaves an excluded SKU completely untouched', async () => {
    const [price] = await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, SKU_EXCLUDED));
    expect(price!.price).toBe(OLD_PRICE);
    expect(price!.isStale).toBe(true); // never re-saved, so never re-freshened
    const points = await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, SKU_EXCLUDED));
    expect(points).toHaveLength(0);
  });

  it('does not guess a price for a mill the source does not carry', async () => {
    const [price] = await db
      .select()
      .from(schema.currentPrices)
      .where(eq(schema.currentPrices.skuId, SKU_OTHER_MILL));
    expect(price!.price).toBe(OLD_PRICE);
  });

  it('logs one traceable row per considered SKU, skips included', async () => {
    const entries = await db.select().from(schema.priceSyncEntries);
    expect(entries).toHaveLength(3);

    const byId = new Map(entries.map((e) => [e.skuId, e]));

    const written = byId.get(SKU_MATCH)!;
    expect(written.outcome).toBe('written');
    expect(written.reason).toBe('write:exact');
    expect(written.oldPrice).toBe(OLD_PRICE);
    expect(written.newPrice).toBe(71_000);
    expect(written.confidence).toBe('exact');
    expect(written.matchedFactory).toBe('شاهین بناب');
    expect(written.sourceUpdatedAt).toBe('1405/5/31');
    expect(written.source).toBe('ahanonline');

    const excluded = byId.get(SKU_EXCLUDED)!;
    expect(excluded.outcome).toBe('skipped');
    expect(excluded.reason).toBe('skip:manual-override');
    expect(excluded.newPrice).toBeNull();

    const other = byId.get(SKU_OTHER_MILL)!;
    expect(other.outcome).toBe('skipped');
    expect(other.reason).toBe('skip:low-confidence-match');
  });

  it('closes out the run row with its counts', async () => {
    const runs = await db.select().from(schema.priceSyncRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('ok');
    expect(runs[0]!.trigger).toBe('manual');
    expect(runs[0]!.written).toBe(1);
    expect(runs[0]!.skipped).toBe(2);
    expect(runs[0]!.finishedAt).not.toBeNull();
  });

  it('refuses to start a second pass while one is still in flight', async () => {
    await db.insert(schema.priceSyncRuns).values({ id: 'run-stuck', source: 'ahanonline', status: 'running' });
    const summary = await runPriceSync({ trigger: 'cron', now: NOW, fetch: stubFetch });
    expect(summary.status).toBe('busy');
    expect(summary.runId).toBeNull();
    await db.delete(schema.priceSyncRuns).where(eq(schema.priceSyncRuns.id, 'run-stuck'));
  });

  it('honours the settings kill switch for a scheduled run', async () => {
    await db.insert(schema.settings).values({ key: 'PRICE_SYNC', value: { enabled: false } });
    const { bustSettingsCache } = await import('@/lib/server/repos/settingsRepo');
    bustSettingsCache();

    const scheduled = await runPriceSync({ trigger: 'cron', now: NOW, fetch: stubFetch });
    expect(scheduled.status).toBe('disabled');

    // …but an admin standing at the panel can still force one.
    const manual = await runPriceSync({ trigger: 'manual', force: true, now: NOW, fetch: stubFetch });
    expect(manual.status).toBe('ok');
  });
});
