// @vitest-environment node
/** Consignment-fee settlements (US-08.5, hardened in W20) — pro-rata
 *  per-ton accrual, the "next period starts from the last settlement, not
 *  from arrival again" rule, the pending/stop-clock accrual bounds, and the
 *  void-as-reversing-entry correction path. */
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
  settlementsPageForUser,
  customerSettlementOverview,
  voidSettlement,
  markSettlementPaid,
  NothingToSettleError,
  ItemPendingError,
  AlreadyVoidedError,
} from './warehouseSettlementsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

async function seedItem(opts: {
  userId: string;
  storedAt: Date;
  monthlyFeeToman: number;
  status?: 'pending' | 'stored' | 'selling' | 'released';
  arrivedAt?: Date;
  releasedAt?: Date;
}) {
  const id = ulid();
  await db.insert(schema.warehouseItems).values({
    id,
    ref: `WH-${id}`,
    userId: opts.userId,
    product: 'میلگرد',
    quantityTons: 5,
    monthlyFeeToman: opts.monthlyFeeToman,
    storedAt: opts.storedAt,
    // Default 'stored': the column itself defaults to 'pending' (not yet
    // physically arrived), which forces zero accrual (W20) — most of these
    // tests are exercising the time-based math, not that rule, so they opt
    // in to 'stored' explicitly rather than inheriting the DB default.
    status: opts.status ?? 'stored',
    arrivedAt: opts.arrivedAt,
    releasedAt: opts.releasedAt,
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
  // monthlyFeeToman is a RATE per ton (W20); seedItem's fixed 5-ton items use
  // 1/5th of the pre-W20 flat-fee test values so the expected totals are
  // unchanged: rate(60,000) × 5 tons × (days/30) === old flat(300,000) × (days/30).
  it('never-settled item accrues from arrival: 10 days at 60,000/ton/month × 5 tons ≈ 100,000', async () => {
    const userId = await seedUser('09130000001');
    const storedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });

    const summary = await unsettledFor(item);
    expect(summary.amountToman).toBeGreaterThanOrEqual(99_000);
    expect(summary.amountToman).toBeLessThanOrEqual(101_000);
    expect(summary.periodFrom).toBe(storedAt.toISOString());
  });

  it('a fresh item (stored seconds ago) accrues ~0', async () => {
    const userId = await seedUser('09130000002');
    const item = await seedItem({ userId, storedAt: new Date(), monthlyFeeToman: 60_000 });
    const summary = await unsettledFor(item);
    expect(summary.amountToman).toBe(0);
  });

  it('a pending item accrues zero even long after being recorded', async () => {
    const userId = await seedUser('09130000008');
    const storedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000, status: 'pending' });
    const summary = await unsettledFor(item);
    expect(summary.amountToman).toBe(0);
  });
});

describe('stop-clock (releasedAt)', () => {
  it('accrual stops at releasedAt, not at now', async () => {
    const userId = await seedUser('09130000010');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const releasedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000, status: 'released', releasedAt });

    const summary = await unsettledFor(item);
    // Only the 20 days between storedAt and releasedAt count, not the full 30.
    expect(summary.amountToman).toBeGreaterThanOrEqual(199_000);
    expect(summary.amountToman).toBeLessThanOrEqual(201_000);
    expect(summary.periodTo).toBe(releasedAt.toISOString());
  });
});

describe('createSettlement', () => {
  it('records a settlement and freezes the qty/fee snapshot', async () => {
    const userId = await seedUser('09130000003');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });

    const settlement = await createSettlement(item.id, null);
    expect(settlement).not.toBeNull();
    expect(settlement!.amountToman).toBeGreaterThanOrEqual(299_000);
    expect(settlement!.amountToman).toBeLessThanOrEqual(301_000);
    expect(settlement!.monthlyFeeToman).toBe(60_000);
    expect(settlement!.quantityTons).toBe(5);
  });

  it('the SECOND settlement periodFrom is the FIRST settlement periodTo, not arrival again', async () => {
    const userId = await seedUser('09130000004');
    const storedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });

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

  it('pro-rates the second period from the previous settlement periodTo, not from arrival', async () => {
    // The item has been in the warehouse 40 days, but 20 of them are already
    // billed. Re-measuring from arrival is the double-bill this test exists
    // to catch: 30 days of fee for 10 days of storage.
    const userId = await seedUser('09130000017');
    const day = 24 * 60 * 60 * 1000;
    const storedAt = new Date(Date.now() - 50 * day); // paperwork date…
    const arrivedAt = new Date(Date.now() - 40 * day); // …physical arrival is what bills
    const item = await seedItem({ userId, storedAt, arrivedAt, monthlyFeeToman: 60_000 });

    const first = await createSettlement(item.id, null, { periodTo: new Date(Date.now() - 20 * day) });
    // Billing starts at arrival, NOT at the earlier storedAt paperwork date.
    expect(first!.periodFrom.toISOString()).toBe(arrivedAt.toISOString());
    // 20 days × 60,000/ton/month × 5 tons ÷ 30 = 200,000.
    expect(first!.amountToman).toBe(200_000);

    const second = await createSettlement(item.id, null, { periodTo: new Date(Date.now() - 10 * day) });
    expect(second!.periodFrom.getTime()).toBe(first!.periodTo.getTime());
    // The 10 days SINCE the last settlement — not the 30 since arrival.
    expect(second!.amountToman).toBe(100_000);
    expect(second!.amountToman).not.toBe(300_000);
    expect(Number.isInteger(second!.amountToman)).toBe(true);
  });

  it('throws NothingToSettleError when periodTo is not after the unsettled period start', async () => {
    const userId = await seedUser('09130000005');
    const storedAt = new Date();
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    await expect(
      createSettlement(item.id, null, { periodTo: new Date(storedAt.getTime() - 1000) }),
    ).rejects.toBeInstanceOf(NothingToSettleError);
  });

  it('throws ItemPendingError for an item that has not physically arrived', async () => {
    const userId = await seedUser('09130000009');
    const storedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000, status: 'pending' });
    await expect(createSettlement(item.id, null)).rejects.toBeInstanceOf(ItemPendingError);
  });

  it('returns null for a warehouse item that does not exist', async () => {
    await expect(createSettlement(ulid(), null)).resolves.toBeNull();
  });

  it('settlementsForUser returns history newest-first', async () => {
    const userId = await seedUser('09130000006');
    const storedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 20_000 });
    await createSettlement(item.id, null);
    await new Promise((r) => setTimeout(r, 5));
    await createSettlement(item.id, null, { periodTo: new Date(Date.now() + 1000) });

    const history = await settlementsForUser(userId);
    expect(history).toHaveLength(2);
    expect(history[0]!.periodTo.getTime()).toBeGreaterThan(history[1]!.periodTo.getTime());
  });
});

describe('voidSettlement', () => {
  it('marks the original voided, inserts a negative reversing entry, and reopens the period', async () => {
    const userId = await seedUser('09130000011');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    expect(settlement).not.toBeNull();

    const result = await voidSettlement(settlement!.id, null, 'اشتباه ثبت شد');
    expect(result).not.toBeNull();
    expect(result!.voided.voidedAt).not.toBeNull();
    expect(result!.reversal.amountToman).toBe(-settlement!.amountToman);
    expect(result!.reversal.voidsSettlementId).toBe(settlement!.id);

    // lastSettlementFor skips both the voided original and the reversal — the
    // period it covered is billable again on the next real settlement.
    const last = await lastSettlementFor(item.id);
    expect(last).toBeNull();
  });

  it('never deletes: the original row survives, flagged, and the pair nets to exactly zero', async () => {
    // A void is a reversing ENTRY. If the original row could vanish, the
    // customer's invoice history would silently rewrite itself — and nothing
    // would say a correction ever happened.
    const userId = await seedUser('09130000018');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);

    const result = await voidSettlement(settlement!.id, null, 'اشتباه ثبت شد');

    const stored = await db
      .select()
      .from(schema.warehouseSettlements)
      .where(eq(schema.warehouseSettlements.id, settlement!.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.voidedAt).not.toBeNull();
    // The original AMOUNT is untouched — only the void flag was added.
    expect(stored[0]!.amountToman).toBe(settlement!.amountToman);

    const reversal = await db
      .select()
      .from(schema.warehouseSettlements)
      .where(eq(schema.warehouseSettlements.voidsSettlementId, settlement!.id));
    expect(reversal).toHaveLength(1);
    expect(reversal[0]!.id).toBe(result!.reversal.id);
    // The books balance to the Toman: original + reversal === 0, exactly.
    expect(stored[0]!.amountToman + reversal[0]!.amountToman).toBe(0);
    expect(Number.isInteger(reversal[0]!.amountToman)).toBe(true);
    // Both rows remain in the customer's history — nothing was removed.
    expect(await settlementsForUser(userId)).toHaveLength(2);
  });

  it('returns null for a settlement that does not exist', async () => {
    await expect(voidSettlement(ulid(), null)).resolves.toBeNull();
  });

  it('throws AlreadyVoidedError when voiding twice', async () => {
    const userId = await seedUser('09130000012');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    await voidSettlement(settlement!.id, null);
    await expect(voidSettlement(settlement!.id, null)).rejects.toBeInstanceOf(AlreadyVoidedError);
  });

  it('throws AlreadyVoidedError when voiding a reversing entry itself', async () => {
    const userId = await seedUser('09130000013');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    const result = await voidSettlement(settlement!.id, null);
    await expect(voidSettlement(result!.reversal.id, null)).rejects.toBeInstanceOf(AlreadyVoidedError);
  });
});

describe('markSettlementPaid', () => {
  it('stamps paidAt and paymentNote', async () => {
    const userId = await seedUser('09130000014');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    const paid = await markSettlementPaid(settlement!.id, 'پرداخت نقدی');
    expect(paid).not.toBeNull();
    expect(paid!.paidAt).not.toBeNull();
    expect(paid!.paymentNote).toBe('پرداخت نقدی');
  });

  it('returns null when already paid', async () => {
    const userId = await seedUser('09130000015');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    await markSettlementPaid(settlement!.id);
    await expect(markSettlementPaid(settlement!.id)).resolves.toBeNull();
  });

  it('returns null for a voided settlement or its reversing entry — never marks either paid', async () => {
    const userId = await seedUser('09130000016');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    const result = await voidSettlement(settlement!.id, null);
    await expect(markSettlementPaid(result!.voided.id)).resolves.toBeNull();
    await expect(markSettlementPaid(result!.reversal.id)).resolves.toBeNull();
  });

  it('the refusal is enforced in the WHERE clause, not by the UI — no row is touched', async () => {
    // The threat model the docstring names is a direct API call, which never
    // passes through the admin screen that hides these buttons. A null return
    // is not enough: the rows themselves must come back unstamped.
    const userId = await seedUser('09130000019');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    const settlement = await createSettlement(item.id, null);
    const result = await voidSettlement(settlement!.id, null);

    await markSettlementPaid(result!.voided.id, 'پرداخت جعلی');
    await markSettlementPaid(result!.reversal.id, 'پرداخت جعلی');

    const rows = await settlementsForUser(userId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.paidAt).toBeNull();
      expect(row.paymentNote).toBeNull();
    }
  });
});

describe('customerSettlementOverview', () => {
  it('sums unsettled amounts across every active item for a customer', async () => {
    const userId = await seedUser('09130000007');
    const storedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    await seedItem({ userId, storedAt, monthlyFeeToman: 30_000 });

    const { customers } = await customerSettlementOverview();
    const mine = customers.find((c) => c.userId === userId);
    expect(mine).toBeDefined();
    expect(mine!.activeItemCount).toBe(2);
    expect(mine!.totalUnsettledToman).toBeGreaterThanOrEqual(449_000);
    expect(mine!.totalUnsettledToman).toBeLessThanOrEqual(451_000);
  });

  it('is sorted by unsettled amount, largest first', async () => {
    const { customers } = await customerSettlementOverview();
    for (let i = 1; i < customers.length; i++) {
      expect(customers[i - 1]!.totalUnsettledToman).toBeGreaterThanOrEqual(customers[i]!.totalUnsettledToman);
    }
  });

  it('grandTotalUnsettledToman equals the sum of the per-customer totals', async () => {
    // The headline figure has to be the server's own sum over the same
    // numbers the rows show — if these ever diverge, the admin is reading a
    // total for a set that is not the one on screen.
    const { customers, grandTotalUnsettledToman, truncated } = await customerSettlementOverview();
    expect(customers.length).toBeGreaterThan(0);
    expect(grandTotalUnsettledToman).toBe(customers.reduce((sum, c) => sum + c.totalUnsettledToman, 0));
    // Nowhere near the 2000-item cap in this fixture.
    expect(truncated).toBe(false);
  });
});

describe('settlementsPageForUser (admin ledger paging)', () => {
  it('pages newest-first with an exact total, and leaves settlementsForUser complete', async () => {
    const userId = await seedUser('09130000021');
    const storedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const item = await seedItem({ userId, storedAt, monthlyFeeToman: 60_000 });
    // Five settlements with strictly increasing periodTo — the ordering key.
    for (let i = 5; i >= 1; i--) {
      await createSettlement(item.id, null, { periodTo: new Date(Date.now() - i * 24 * 60 * 60 * 1000) });
    }

    const p1 = await settlementsPageForUser(userId, 1, 2);
    expect(p1.total).toBe(5);
    expect(p1.page).toBe(1);
    expect(p1.perPage).toBe(2);
    expect(p1.rows).toHaveLength(2);

    const p2 = await settlementsPageForUser(userId, 2, 2);
    expect(p2.total).toBe(5);
    expect(p2.rows).toHaveLength(2);
    // Page 2 continues strictly below page 1 — newest-first is preserved
    // across the boundary, with no overlap.
    expect(p1.rows[1]!.periodTo.getTime()).toBeGreaterThanOrEqual(p2.rows[0]!.periodTo.getTime());
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(4);

    const p3 = await settlementsPageForUser(userId, 3, 2);
    expect(p3.rows).toHaveLength(1); // remainder

    // The unpaged sibling is untouched: /api/me/export still gets all of it.
    expect(await settlementsForUser(userId)).toHaveLength(5);
  });
});
