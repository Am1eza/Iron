import { asc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { warehouseBillingEvents } from '@/lib/server/db/schema';
import type { warehouseItems } from '@/lib/server/db/schema';
import { BusinessRuleError, stockGrams, safeMoney } from '@/lib/server/utils/businessOperation';

type Item = Pick<typeof warehouseItems.$inferSelect, 'id' | 'status' | 'arrivedAt' | 'storedAt' | 'quantityTons' | 'monthlyFeeToman'>;
type Event = typeof warehouseBillingEvents.$inferSelect;
export type BillingSegment = { from: string; to: string; quantityTons: number; monthlyFeeToman: number };

export async function billingEventsFor(ids: string[], tx: DbOrTx = getDb()): Promise<Map<string, Event[]>> {
  const map = new Map<string, Event[]>();
  if (!ids.length) return map;
  const rows = await tx.select().from(warehouseBillingEvents).where(inArray(warehouseBillingEvents.warehouseItemId, ids))
    .orderBy(asc(warehouseBillingEvents.effectiveAt), asc(warehouseBillingEvents.id));
  for (const row of rows) map.set(row.warehouseItemId, [...(map.get(row.warehouseItemId) ?? []), row]);
  return map;
}

export function billPeriod(item: Item, from: Date, to: Date, events: Event[] = []): { amountToman: number; segments: BillingSegment[] } {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new BusinessRuleError('invalid_period', 'بازهٔ زمانی معتبر لازم است.', 400);
  if (to <= from) return { amountToman: 0, segments: [] };
  let qty = item.quantityTons, fee = item.monthlyFeeToman;
  // The initial event covers the opening balance. Rows before this feature
  // use their frozen migration baseline, never today's edited value.
  if (events.length) { qty = events[0]!.quantityTons; fee = events[0]!.monthlyFeeToman; }
  for (const event of events) if (event.effectiveAt <= from) { qty = event.quantityTons; fee = event.monthlyFeeToman; }
  const segments: BillingSegment[] = [];
  let cursor = from;
  let numerator = 0n;
  const denominator = 1_000_000n * 30n * 86_400_000n;
  const append = (end: Date) => {
    if (end <= cursor) return;
    const grams = stockGrams(qty); safeMoney(fee, 1000000000);
    numerator += BigInt(grams) * BigInt(fee) * BigInt(end.getTime() - cursor.getTime());
    segments.push({ from: cursor.toISOString(), to: end.toISOString(), quantityTons: qty, monthlyFeeToman: fee });
    cursor = end;
  };
  for (const event of events) {
    if (event.effectiveAt <= from || event.effectiveAt >= to) continue;
    append(event.effectiveAt); qty = event.quantityTons; fee = event.monthlyFeeToman;
  }
  append(to);
  const rounded = (numerator + denominator / 2n) / denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new BusinessRuleError('billing_overflow', 'مبلغ این دوره از سقف مجاز عبور می‌کند؛ دوره را کوتاه‌تر کنید.');
  return { amountToman: Number(rounded), segments };
}

/** Called under the item's row lock, before changing quantity/rate. */
export async function recordBillingChange(tx: DbOrTx, before: Item, after: Item, at: Date, actorId: string | null, note: string): Promise<void> {
  if (before.status === 'pending' && after.status === 'pending') return;
  const existing = await tx.select({ id: warehouseBillingEvents.id }).from(warehouseBillingEvents)
    .where(eq(warehouseBillingEvents.warehouseItemId, before.id)).limit(1);
  if (!existing.length) {
    await tx.insert(warehouseBillingEvents).values({ id: ulid(), warehouseItemId: before.id,
      effectiveAt: before.arrivedAt ?? before.storedAt, quantityTons: before.quantityTons,
      monthlyFeeToman: before.monthlyFeeToman, actorId, note: 'ماندهٔ افتتاحیهٔ دورهٔ نگهداری' });
  }
  if (before.quantityTons !== after.quantityTons || before.monthlyFeeToman !== after.monthlyFeeToman || after.status === 'released')
    await tx.insert(warehouseBillingEvents).values({ id: ulid(), warehouseItemId: before.id, effectiveAt: at,
      quantityTons: after.status === 'released' ? 0 : after.quantityTons, monthlyFeeToman: after.monthlyFeeToman, actorId, note });
}
