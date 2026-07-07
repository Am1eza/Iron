// @vitest-environment node
/**
 * P4 integration — alerts fire on crossings (SMS-logged, one-shot), favorites
 * round-trip as PriceRows, club tiers advance with the hybrid points model
 * (delivered orders + profile + verification).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { createAlert, alertsForUser, claimAlertForTrigger } from '@/lib/server/repos/alertsRepo';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { addFavorite, favoritesForUser, removeFavorite } from '@/lib/server/repos/favoritesRepo';
import { joinClub, clubStatus, recomputeTier } from '@/lib/server/repos/clubRepo';
import { createOrder, updateOrderStatus, cancelOrder } from '@/lib/server/repos/ordersRepo';
import { savePrice } from '@/lib/server/services/pricing.service';

let db: Db;
let close: () => Promise<void>;
const USER = 'u-admin';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 2 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('alerts', () => {
  it('fires once when the price crosses the threshold, then stays triggered', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[0]!;
    await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'below',
      threshold: sku.current.price - 5000, // not crossed yet
      channel: 'sms',
    });

    expect(await evaluateAlerts()).toBe(0);

    // Price drops below the threshold → the alert fires.
    await savePrice(USER, { skuId: sku.id, price: sku.current.price - 6000 });
    expect(await evaluateAlerts()).toBe(1);

    const mine = await alertsForUser(USER);
    const fired = mine.find((a) => a.target.type === 'sku');
    expect(fired?.status).toBe('triggered');
    expect(fired?.target.label).toBe(sku.name);

    // One-shot: a second evaluation doesn't re-fire.
    expect(await evaluateAlerts()).toBe(0);

    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.kind, 'alert'));
    expect(sms.length).toBe(1);
    expect(sms[0]!.status).toBe('dev_logged');
  });

  it('merges a duplicate create into the existing active alert instead of inserting a second row (VR-C1)', async () => {
    const rows = await tableRows('ibeam');
    const sku = rows[1]!;
    const spec = {
      userId: USER,
      target: { type: 'sku' as const, skuId: sku.id },
      op: 'above' as const,
      threshold: sku.current.price + 5000,
      channel: 'sms' as const,
    };

    const first = await createAlert(spec);
    expect(first.merged).toBe(false);

    // A double-submit (same user/target/op/threshold, still active) merges.
    const second = await createAlert(spec);
    expect(second.merged).toBe(true);
    expect(second.alert.id).toBe(first.alert.id);

    const mine = await alertsForUser(USER);
    const matching = mine.filter(
      (a) => a.target.type === 'sku' && a.target.skuId === sku.id && a.threshold === spec.threshold,
    );
    expect(matching).toHaveLength(1);
  });

  it('claimAlertForTrigger is a one-winner compare-and-swap (concurrent evaluators cannot double-fire)', async () => {
    const rows = await tableRows('ibeam');
    const sku = rows[2]!;
    const created = await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'below',
      threshold: sku.current.price + 1000,
      channel: 'sms',
    });

    // Simulate two evaluators racing to claim the same crossing concurrently.
    const [a, b] = await Promise.all([
      claimAlertForTrigger(created.alert.id),
      claimAlertForTrigger(created.alert.id),
    ]);
    const winners = [a, b].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.status).toBe('triggered');

    // Already triggered — a third claim attempt also loses.
    expect(await claimAlertForTrigger(created.alert.id)).toBeNull();
  });
});

describe('favorites', () => {
  it('adds by slug, lists as PriceRows, removes', async () => {
    const rows = await tableRows('ibeam');
    const sku = rows[0]!;
    expect(await addFavorite(USER, sku.slug)).toBe(true);
    expect(await addFavorite(USER, sku.slug)).toBe(true); // idempotent

    const favs = await favoritesForUser(USER);
    expect(favs).toHaveLength(1);
    expect(favs[0]!.slug).toBe(sku.slug);
    expect(favs[0]!.current.price).toBeGreaterThan(0);

    await removeFavorite(USER, sku.slug);
    expect(await favoritesForUser(USER)).toHaveLength(0);
  });
});

describe('club (hybrid points model)', () => {
  const deliver = async (ref: string) => {
    await createOrder({ ref, userId: USER, items: [] });
    // registered → confirmed → loading → in_transit → delivered
    for (const s of ['confirmed', 'loading', 'in_transit', 'delivered'] as const) {
      await updateOrderStatus(ref, s);
    }
  };

  it('joins at iron and advances to steel once enough points accrue (default steel=5)', async () => {
    await joinClub(USER);
    let status = await clubStatus(USER);
    expect(status.tier).toBe('iron');
    expect(status.points).toBe(0);

    // 5 delivered orders = 5 points (order weight 1) → steel threshold.
    for (let i = 0; i < 5; i++) await deliver(`OR-CLUB-${i}`);
    const tier = await recomputeTier(USER);
    expect(tier).toBe('steel');
    status = await clubStatus(USER);
    expect(status.deliveredOrders).toBe(5);
    expect(status.points).toBe(5);
    expect(status.nextTier?.tier).toBe('poolad');
  });

  it('points come from orders + profile + verification (reinforcing systems)', async () => {
    // Complete the profile (+1) and approve personal identity (+2) → 5+3 = 8.
    await db.update(schema.users).set({ firstName: 'رضا', lastName: 'کریمی', idVerifyStatus: 'approved' }).where(eq(schema.users.id, USER));
    const status = await clubStatus(USER);
    expect(status.breakdown.fromOrders).toBe(5);
    expect(status.breakdown.fromProfile).toBe(1);
    expect(status.breakdown.fromVerification).toBe(2);
    expect(status.points).toBe(8);
    expect(status.verificationLevel).toBe(2);
  });

  it('downgrades when delivered orders are cancelled (points fall below threshold)', async () => {
    // Revoke the profile + verification bonuses and cancel 4 of the 5 orders →
    // 1 point, below steel's 5.
    await db.update(schema.users).set({ firstName: null, lastName: null, idVerifyStatus: 'none' }).where(eq(schema.users.id, USER));
    for (let i = 0; i < 4; i++) await cancelOrder(`OR-CLUB-${i}`);
    const tier = await recomputeTier(USER);
    expect(tier).toBe('iron');
    const status = await clubStatus(USER);
    expect(status.deliveredOrders).toBe(1);
    expect(status.tier).toBe('iron');
  });
});
