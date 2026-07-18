// @vitest-environment node
/** Consignment-fee settlements (US-08.5) — pro-rata accrual + the "next
 *  period starts from the last settlement, not from storedAt again" rule. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  unsettledFor,
  createSettlement,
  lastSettlementFor,
  settlementsForUser,
  customerSettlementOverview,
  NothingToSettleError,
} from './warehouseSettlementsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

async function seedItem(opts: { userId: string; storedAt: Date; monthlyFeeToman: number }) {
  const id = ulid();
  await db.insert(schema.warehouseItems).values({
    id,
    ref: `WH-${id}`,
    userId: opts.userId,
    product: 'میلگرد',
    quantityTons: 5,
    monthlyFeeToman: opts.monthlyFeeToman,
    storedAt: opts.storedAt,
  });
  const rows = await db.select().from(schema.warehouseItems).where(eq(schema.warehouseItems.id, id));
  return rows[0]!;
}

async function seedUser(mobile: string) {
  const id = ulid();
  await db.insert(schema.users).values({ id, mobile });
  return id;
}

describe('unsettledFor', () => {
  it('never-settled item accrues from storedAt: 10 days at 300,000/month ≈ 100,000', async () => {
    const userId = await seedUser('09130000001');
    const storedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 300_000 });

    const summary = await unsettledFor(item);
    expect(summary.amountToman).toBeGreaterThanOrEqual(99_000);
    expect(summary.amountToman).toBeLessThanOrEqual(101_000);
    expect(summary.periodFrom).toBe(storedAt.toISOString());
  });

  it('a fresh item (stored seconds ago) accrues ~0', async () => {
    const userId = await seedUser('09130000002');
    const item = await seedItem({ userId, storedAt: new Date(), monthlyFeeToman: 300_000 });
    const summary = await unsettledFor(item);
    expect(summary.amountToman).toBe(0);
  });
});

describe('createSettlement', () => {
  it('records a settlement and freezes the qty/fee snapshot', async () => {
    const userId = await seedUser('09130000003');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 300_000 });

    const settlement = await createSettlement(item.id, null);
    expect(settlement).not.toBeNull();
    expect(settlement!.amountToman).toBeGreaterThanOrEqual(299_000);
    expect(settlement!.amountToman).toBeLessThanOrEqual(301_000);
    expect(settlement!.monthlyFeeToman).toBe(300_000);
    expect(settlement!.quantityTons).toBe(5);
  });

  it('the SECOND settlement periodFrom is the FIRST settlement periodTo, not storedAt again', async () => {
    const userId = await seedUser('09130000004');
    const storedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 300_000 });

    const first = await createSettlement(item.id, null);
    expect(first).not.toBeNull();
    expect(first!.periodFrom.toISOString()).toBe(storedAt.toISOString());

    const second = await createSettlement(item.id, null);
    expect(second).not.toBeNull();
    expect(second!.periodFrom.getTime()).toBe(first!.periodTo.getTime());
    // NOT measured from storedAt — the whole 20-day span was already billed once.
    expect(second!.periodFrom.getTime()).not.toBe(storedAt.getTime());

    const last = await lastSettlementFor(item.id);
    expect(last?.id).toBe(second!.id);
  });

  it('throws NothingToSettleError when periodTo is not after the unsettled period start', async () => {
    const userId = await seedUser('09130000005');
    const storedAt = new Date();
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 300_000 });
    await expect(
      createSettlement(item.id, null, { periodTo: new Date(storedAt.getTime() - 1000) }),
    ).rejects.toBeInstanceOf(NothingToSettleError);
  });

  it('returns null for a warehouse item that does not exist', async () => {
    await expect(createSettlement(ulid(), null)).resolves.toBeNull();
  });

  it('settlementsForUser returns history newest-first', async () => {
    const userId = await seedUser('09130000006');
    const storedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 100_000 });
    await createSettlement(item.id, null);
    await new Promise((r) => setTimeout(r, 5));
    await createSettlement(item.id, null, { periodTo: new Date(Date.now() + 1000) });

    const history = await settlementsForUser(userId);
    expect(history).toHaveLength(2);
    expect(history[0]!.periodTo.getTime()).toBeGreaterThan(history[1]!.periodTo.getTime());
  });
});

describe('customerSettlementOverview', () => {
  it('sums unsettled amounts across every active item for a customer', async () => {
    const userId = await seedUser('09130000007');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await seedItem({ userId, storedAt, monthlyFeeToman: 300_000 });
    await seedItem({ userId, storedAt, monthlyFeeToman: 150_000 });

    const overview = await customerSettlementOverview();
    const mine = overview.find((c) => c.userId === userId);
    expect(mine).toBeDefined();
    expect(mine!.activeItemCount).toBe(2);
    expect(mine!.totalUnsettledToman).toBeGreaterThanOrEqual(449_000);
    expect(mine!.totalUnsettledToman).toBeLessThanOrEqual(451_000);
  });

  it('is sorted by unsettled amount, largest first', async () => {
    const overview = await customerSettlementOverview();
    for (let i = 1; i < overview.length; i++) {
      expect(overview[i - 1]!.totalUnsettledToman).toBeGreaterThanOrEqual(overview[i]!.totalUnsettledToman);
    }
  });
});
