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
import { ulid } from 'ulid';
import {
  createAlert,
  alertsForUser,
  claimAlertForTrigger,
  revertAlertClaim,
  reactivateAlert,
  updateAlertStatus,
  deleteAlert,
  findAlert,
  alertCapForTier,
  DEFAULT_ALERT_TIER_CAPS,
  AlertTargetNotFoundError,
  AlertCapExceededError,
} from '@/lib/server/repos/alertsRepo';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { addFavorite, favoritesForUser, removeFavorite } from '@/lib/server/repos/favoritesRepo';
import { joinClub, clubStatus, recomputeTier } from '@/lib/server/repos/clubRepo';
import { createOrder, updateOrderStatus, cancelOrder } from '@/lib/server/repos/ordersRepo';
import { savePrice } from '@/lib/server/services/pricing.service';

let db: Db;
let close: () => Promise<void>;
const USER = 'u-admin';

async function seedUser(mobile: string): Promise<string> {
  const id = ulid();
  await db.insert(schema.users).values({ id, mobile });
  return id;
}

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
      cap: 100,
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
      cap: 100,
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
      cap: 100,
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

  it('fires an ABOVE-direction alert (only below was previously covered)', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[1]!;
    await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'above',
      threshold: sku.current.price + 5000,
      channel: 'sms',
      cap: 100,
    });
    expect(await evaluateAlerts()).toBe(0); // not crossed yet

    await savePrice(USER, { skuId: sku.id, price: sku.current.price + 6000 });
    expect(await evaluateAlerts()).toBe(1);

    const mine = await alertsForUser(USER);
    const fired = mine.find((a) => a.target.type === 'sku' && a.target.skuId === sku.id && a.op === 'above');
    expect(fired?.status).toBe('triggered');
  });

  it('fires a MARKET-type alert (the marketValue join path was previously untested)', async () => {
    await db.update(schema.marketValues).set({ value: 500_000, isStale: false }).where(eq(schema.marketValues.key, 'usd'));
    await createAlert({
      userId: USER,
      target: { type: 'market', key: 'usd' },
      op: 'below',
      threshold: 550_000,
      channel: 'sms',
      cap: 100,
    });
    expect(await evaluateAlerts()).toBe(1);

    const mine = await alertsForUser(USER);
    const fired = mine.find((a) => a.target.type === 'market' && a.target.key === 'usd');
    expect(fired?.status).toBe('triggered');
    expect(fired?.target.label).toBeTruthy();
  });

  it('does NOT fire on a stale price, even past the threshold (W22)', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[2]!;
    await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'below',
      threshold: sku.current.price + 1, // already crossed
      channel: 'sms',
      cap: 100,
    });
    await db.update(schema.currentPrices).set({ isStale: true }).where(eq(schema.currentPrices.skuId, sku.id));
    expect(await evaluateAlerts()).toBe(0);

    // Freshening the feed lets it fire.
    await db.update(schema.currentPrices).set({ isStale: false }).where(eq(schema.currentPrices.skuId, sku.id));
    expect(await evaluateAlerts()).toBe(1);
  });

  it('revertAlertClaim un-claims a triggered alert back to active (W22 — SMS-failure recovery)', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[3]!;
    const created = await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'below',
      threshold: sku.current.price + 1000,
      channel: 'sms',
      cap: 100,
    });
    const claimed = await claimAlertForTrigger(created.alert.id);
    expect(claimed?.status).toBe('triggered');

    await revertAlertClaim(created.alert.id);
    const mine = await alertsForUser(USER);
    const reverted = mine.find((a) => a.id === created.alert.id);
    expect(reverted?.status).toBe('active');
    expect(reverted?.lastTriggeredAt).toBeUndefined();

    // Un-reverts nothing if the alert isn't actually 'triggered' (CAS safety)
    // — calling it again on an already-active alert is a no-op.
    await revertAlertClaim(created.alert.id);
    const stillActive = (await alertsForUser(USER)).find((a) => a.id === created.alert.id);
    expect(stillActive?.status).toBe('active');
  });

  it('rejects creating an alert on a SKU that does not exist (W22 — was a raw FK-violation 500)', async () => {
    await expect(
      createAlert({
        userId: USER,
        target: { type: 'sku', skuId: 'sku-does-not-exist' },
        op: 'below',
        threshold: 100_000,
        channel: 'sms',
        cap: 100,
      }),
    ).rejects.toBeInstanceOf(AlertTargetNotFoundError);
  });

  it('soft-deletes: findAlert/alertsForUser stop seeing it, the row survives (W22 — was a hard DELETE)', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[4]!;
    const created = await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'below',
      threshold: sku.current.price + 1000,
      channel: 'sms',
      cap: 100,
    });
    await deleteAlert(created.alert.id);

    expect(await findAlert(created.alert.id)).toBeNull();
    expect((await alertsForUser(USER)).find((a) => a.id === created.alert.id)).toBeUndefined();

    const raw = await db.select().from(schema.alerts).where(eq(schema.alerts.id, created.alert.id));
    expect(raw).toHaveLength(1);
    expect(raw[0]!.deletedAt).not.toBeNull();
  });

  it('per-tier caps: base/iron share one cap, steel and poolad get more (W22 — owner\'s call)', async () => {
    expect(await alertCapForTier(undefined)).toBe(DEFAULT_ALERT_TIER_CAPS.base);
    expect(await alertCapForTier('iron')).toBe(DEFAULT_ALERT_TIER_CAPS.iron);
    expect(await alertCapForTier('steel')).toBe(DEFAULT_ALERT_TIER_CAPS.steel);
    expect(await alertCapForTier('poolad')).toBe(DEFAULT_ALERT_TIER_CAPS.poolad);
    expect(await alertCapForTier(undefined)).toBe(await alertCapForTier('iron'));
    expect(await alertCapForTier('steel')).toBeGreaterThan(await alertCapForTier(undefined));
    expect(await alertCapForTier('poolad')).toBeGreaterThan(await alertCapForTier('steel'));
  });

  it('createAlert throws AlertCapExceededError once the cap is reached — a MERGE never consumes a slot (W22 review fix)', async () => {
    const userId = await seedUser('09130000101');
    const rows = await tableRows('rebar');
    const first = await createAlert({
      userId,
      target: { type: 'sku', skuId: rows[0]!.id },
      op: 'below',
      threshold: rows[0]!.current.price - 1000,
      channel: 'sms',
      cap: 2,
    });
    await createAlert({
      userId,
      target: { type: 'sku', skuId: rows[1]!.id },
      op: 'below',
      threshold: rows[1]!.current.price - 1000,
      channel: 'sms',
      cap: 2,
    });
    // At cap (2) — a third, genuinely NEW target is rejected.
    await expect(
      createAlert({
        userId,
        target: { type: 'sku', skuId: rows[2]!.id },
        op: 'below',
        threshold: rows[2]!.current.price - 1000,
        channel: 'sms',
        cap: 2,
      }),
    ).rejects.toBeInstanceOf(AlertCapExceededError);

    // Re-submitting the FIRST alert's exact spec merges instead of counting
    // as a new one — a merge must never be blocked by the cap.
    const merged = await createAlert({
      userId,
      target: { type: 'sku', skuId: rows[0]!.id },
      op: 'below',
      threshold: rows[0]!.current.price - 1000,
      channel: 'sms',
      cap: 2,
    });
    expect(merged.merged).toBe(true);
    expect(merged.alert.id).toBe(first.alert.id);
  });

  it('reactivateAlert enforces the cap atomically, closing the pause→create→reactivate bypass (W22 review fix)', async () => {
    const userId = await seedUser('09130000102');
    const rows = await tableRows('ibeam');
    const a = await createAlert({
      userId,
      target: { type: 'sku', skuId: rows[0]!.id },
      op: 'below',
      threshold: rows[0]!.current.price - 1000,
      channel: 'sms',
      cap: 2,
    });
    const b = await createAlert({
      userId,
      target: { type: 'sku', skuId: rows[1]!.id },
      op: 'below',
      threshold: rows[1]!.current.price - 1000,
      channel: 'sms',
      cap: 2,
    });
    // Pause A to "free up" a slot, fill it with a third alert, then try to
    // reactivate A — exactly the bypass the audit flagged: without this
    // fix, the user would end up with 3 active alerts on a cap of 2.
    await updateAlertStatus(a.alert.id, 'paused');
    const c = await createAlert({
      userId,
      target: { type: 'sku', skuId: rows[2]!.id },
      op: 'below',
      threshold: rows[2]!.current.price - 1000,
      channel: 'sms',
      cap: 2,
    });
    expect(c.merged).toBe(false);

    await expect(reactivateAlert(a.alert.id, userId, 2)).rejects.toBeInstanceOf(AlertCapExceededError);

    // Still exactly 2 active alerts (B and C), not 3.
    const mine = await alertsForUser(userId);
    const active = mine.filter((x) => x.status === 'active').map((x) => x.id).sort();
    expect(active).toEqual([b.alert.id, c.alert.id].sort());

    // Pausing B first genuinely frees a slot — reactivating A now succeeds.
    await updateAlertStatus(b.alert.id, 'paused');
    const reactivated = await reactivateAlert(a.alert.id, userId, 2);
    expect(reactivated?.status).toBe('active');
  });

  it('the DB-level partial unique indexes reject a duplicate active alert inserted outside the app layer (W22 review fix — the original single-index design silently enforced nothing)', async () => {
    const userId = await seedUser('09130000103');
    const rows = await tableRows('rebar');
    const sku = rows[0]!;

    await db.insert(schema.alerts).values({
      id: ulid(),
      userId,
      targetType: 'sku',
      skuId: sku.id,
      op: 'below',
      threshold: 12345,
      status: 'active',
    });
    await expect(
      db.insert(schema.alerts).values({
        id: ulid(),
        userId,
        targetType: 'sku',
        skuId: sku.id,
        op: 'below',
        threshold: 12345,
        status: 'active',
      }),
    ).rejects.toThrow();

    // Same guarantee for the market-type partial index.
    await db.insert(schema.alerts).values({
      id: ulid(),
      userId,
      targetType: 'market',
      marketKey: 'eur',
      op: 'above',
      threshold: 999,
      status: 'active',
    });
    await expect(
      db.insert(schema.alerts).values({
        id: ulid(),
        userId,
        targetType: 'market',
        marketKey: 'eur',
        op: 'above',
        threshold: 999,
        status: 'active',
      }),
    ).rejects.toThrow();
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

  it('cancelOrder() ALONE (no manual recomputeTier call) downgrades the tier — W17 regression', async () => {
    // Every test above calls recomputeTier() itself to observe the effect;
    // that was masking a real bug where the production DELETE route's actual
    // call path — cancelOrder() — never triggered a recompute at all, so a
    // real customer return left an inflated tier stale until something
    // unrelated happened to touch that user. This proves cancelOrder() now
    // fires it on its own, fire-and-forget, same as updateOrderStatus does
    // on the delivered transition.
    //
    // 1 delivered order survives from the previous test; deliver 4 more
    // (same steel=5 threshold already established above) to cross back into
    // steel, then cancel just ONE of the new ones and expect the drop back
    // to iron to happen WITHOUT calling recomputeTier ourselves.
    const refs = Array.from({ length: 4 }, (_, i) => `OR-CLUB-REGRESSION-${i}`);
    for (const ref of refs) await deliver(ref);
    const before = await recomputeTier(USER);
    expect(before).toBe('steel');
    expect((await clubStatus(USER)).deliveredOrders).toBe(5);

    await cancelOrder(refs[0]!); // <-- no recomputeTier() call here, unlike every test above
    // Fire-and-forget: give the dynamic import + recompute microtask/DB round
    // trip a moment to land before asserting.
    await new Promise((r) => setTimeout(r, 200));

    const status = await clubStatus(USER);
    expect(status.deliveredOrders).toBe(4);
    expect(status.tier).toBe('iron');
  });
});
