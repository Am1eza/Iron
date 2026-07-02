/** Price alerts (قیمت‌سنج) — per-user CRUD + the evaluation query. */
import { and, desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { alerts, skus, currentPrices, marketValues } from '@/lib/server/db/schema';
import type { MarketKey, NotifyChannel } from '@/lib/types/domain';

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

export async function createAlert(input: {
  userId: string;
  target: { type: 'sku'; skuId: string } | { type: 'market'; key: MarketKey };
  op: 'below' | 'above';
  threshold: number;
  channel: NotifyChannel;
}): Promise<AlertDto> {
  const rows = await getDb()
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
  return toAlertDto(rows[0]!);
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
