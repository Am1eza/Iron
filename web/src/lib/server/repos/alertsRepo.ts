/** Price alerts (قیمت‌سنج) — per-user CRUD + the evaluation query. */
import { and, desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { alerts, skus, currentPrices, marketValues } from '@/lib/server/db/schema';
import type { MarketKey, NotifyChannel } from '@/lib/types/domain';

/** Stable per-alert-key string for the advisory-lock hash in `createAlert`. */
function dedupKey(input: {
  userId: string;
  target: { type: 'sku'; skuId: string } | { type: 'market'; key: MarketKey };
  op: 'below' | 'above';
  threshold: number;
}): string {
  const targetKey = input.target.type === 'sku' ? input.target.skuId : input.target.key;
  return `alert-dedup:${input.userId}:${input.target.type}:${targetKey}:${input.op}:${input.threshold}`;
}

export type AlertRow = typeof alerts.$inferSelect;

export interface AlertDto {
  id: string;
  target: { type: 'sku'; skuId: string; label?: string } | { type: 'market'; key: MarketKey; label?: string };
  op: 'below' | 'above';
  threshold: number;
  channel: NotifyChannel;
  status: 'active' | 'triggered' | 'paused';
  lastTriggeredAt?: string;
  createdAt: string;
}

export function toAlertDto(r: AlertRow, label?: string): AlertDto {
  return {
    id: r.id,
    target:
      r.targetType === 'sku'
        ? { type: 'sku', skuId: r.skuId ?? '', label }
        : { type: 'market', key: (r.marketKey ?? 'usd') as MarketKey, label },
    op: r.op,
    threshold: r.threshold,
    channel: r.channel,
    status: r.status,
    lastTriggeredAt: r.lastTriggeredAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function activeAlertCount(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.status, 'active')));
  return rows[0]?.n ?? 0;
}

/**
 * Create an alert, merging into an existing identical ACTIVE alert instead
 * of duplicating it (VR-C1 — a double-submit must not fire two SMS for one
 * crossing). Race-safe: a Postgres advisory transaction lock serializes
 * concurrent creates for the SAME (user, target, op, threshold) key, so two
 * simultaneous requests can't both pass a "does it exist?" check and both
 * insert (the same TOCTOU class of bug as an unlocked SELECT-then-INSERT).
 */
export async function createAlert(input: {
  userId: string;
  target: { type: 'sku'; skuId: string } | { type: 'market'; key: MarketKey };
  op: 'below' | 'above';
  threshold: number;
  channel: NotifyChannel;
}): Promise<{ alert: AlertDto; merged: boolean }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dedupKey(input)}))`);

    const matchCond = and(
      eq(alerts.userId, input.userId),
      eq(alerts.status, 'active'),
      eq(alerts.targetType, input.target.type),
      input.target.type === 'sku' ? eq(alerts.skuId, input.target.skuId) : eq(alerts.marketKey, input.target.key),
      eq(alerts.op, input.op),
      eq(alerts.threshold, input.threshold),
    );
    const existing = await tx.select().from(alerts).where(matchCond).limit(1);
    if (existing[0]) {
      return { alert: toAlertDto(existing[0]), merged: true };
    }

    const rows = await tx
      .insert(alerts)
      .values({
        id: ulid(),
        userId: input.userId,
        targetType: input.target.type,
        skuId: input.target.type === 'sku' ? input.target.skuId : null,
        marketKey: input.target.type === 'market' ? input.target.key : null,
        op: input.op,
        threshold: input.threshold,
        channel: input.channel,
      })
      .returning();
    return { alert: toAlertDto(rows[0]!), merged: false };
  });
}

/** User's alerts with display labels (SKU name / market label). */
export async function alertsForUser(userId: string): Promise<AlertDto[]> {
  const rows = await getDb()
    .select({ alert: alerts, skuName: skus.name, marketLabel: marketValues.label })
    .from(alerts)
    .leftJoin(skus, eq(alerts.skuId, skus.id))
    .leftJoin(marketValues, eq(alerts.marketKey, marketValues.key))
    .where(eq(alerts.userId, userId))
    .orderBy(desc(alerts.createdAt));
  return rows.map((r) => toAlertDto(r.alert, r.skuName ?? r.marketLabel ?? undefined));
}

export async function findAlert(id: string): Promise<AlertRow | null> {
  const rows = await getDb().select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateAlertStatus(id: string, status: AlertRow['status'], lastTriggeredAt?: Date) {
  const rows = await getDb()
    .update(alerts)
    .set({ status, ...(lastTriggeredAt ? { lastTriggeredAt } : {}) })
    .where(eq(alerts.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Atomically claim an alert for firing — compare-and-swap on `status='active'`.
 * Returns the updated row only if THIS call won the race (still active at
 * the moment of the UPDATE), null if another concurrent evaluator already
 * claimed it. Callers MUST claim before sending the notification (not after)
 * — `evaluateAlerts` can run from both the 60s job and an inline call after
 * an admin price save, and Postgres's row-level UPDATE lock is what actually
 * serializes the two, not any lock taken in application code.
 */
export async function claimAlertForTrigger(id: string): Promise<AlertRow | null> {
  const rows = await getDb()
    .update(alerts)
    .set({ status: 'triggered', lastTriggeredAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.status, 'active')))
    .returning();
  return rows[0] ?? null;
}

export async function deleteAlert(id: string): Promise<void> {
  await getDb().delete(alerts).where(eq(alerts.id, id));
}

/** Active alerts joined with their current values + owner mobile — the job's input. */
export async function activeAlertsWithValues() {
  const db = getDb();
  const { users } = await import('@/lib/server/db/schema');
  return db
    .select({
      alert: alerts,
      mobile: users.mobile,
      skuName: skus.name,
      skuPrice: currentPrices.price,
      marketLabel: marketValues.label,
      marketValue: marketValues.value,
    })
    .from(alerts)
    .innerJoin(users, eq(alerts.userId, users.id))
    .leftJoin(skus, eq(alerts.skuId, skus.id))
    .leftJoin(currentPrices, eq(alerts.skuId, currentPrices.skuId))
    .leftJoin(marketValues, eq(alerts.marketKey, marketValues.key))
    .where(eq(alerts.status, 'active'));
}
