import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { auditEntries, businessOperations } from '@/lib/server/db/schema';

export class BusinessRuleError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** The claim, business writes, audit and response all commit together. No
 * durable pending claim exists, so a crashed process needs no TTL deletion.
 */
export async function businessOperation<T>(id: string, input: unknown, run: (tx: DbOrTx) => Promise<T>): Promise<T> {
  if (!id || id.length > 300) throw new BusinessRuleError('operation_key', 'شناسهٔ عملیات معتبر لازم است.', 400);
  const requestHash = createHash('sha256').update(canonical(input)).digest('hex');
  return getDb().transaction(async tx => {
    const inserted = await tx.insert(businessOperations).values({ id, requestHash, result: {} })
      .onConflictDoNothing().returning();
    if (!inserted.length) {
      const [existing] = await tx.select().from(businessOperations).where(eq(businessOperations.id, id));
      if (existing?.requestHash !== requestHash) throw new BusinessRuleError('operation_conflict', 'این شناسه قبلاً برای اطلاعات دیگری استفاده شده است.');
      return existing.result as T;
    }
    const result = JSON.parse(JSON.stringify(await run(tx))) as T;
    await tx.update(businessOperations).set({ result }).where(eq(businessOperations.id, id));
    return result;
  });
}

export async function financialAudit(tx: DbOrTx, actorId: string | null, action: string,
  entityType: string, entityId: string, before: unknown, after: unknown): Promise<void> {
  await tx.insert(auditEntries).values({ id: ulid(), actorId, action, entityType, entityId, before, after });
}

export function stockGrams(tons: number): number {
  const grams = Math.round(tons * 1_000_000);
  if (!Number.isFinite(tons) || tons < 0 || tons > 100000 || Math.abs(tons * 1_000_000 - grams) > 0.00001)
    throw new BusinessRuleError('invalid_quantity', 'مقدار باید بین صفر و ۱۰۰هزار تن، با حداکثر شش رقم اعشار باشد.', 400);
  return grams;
}

export function safeMoney(value: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new BusinessRuleError('invalid_money', 'مبلغ صحیح و معتبر به تومان لازم است.', 400);
  return value;
}
