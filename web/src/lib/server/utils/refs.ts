/**
 * Human reference generator — `PF-14050410-0021` style: prefix + Jalali date
 * stamp (Tehran) + a per-day atomic sequence from ref_counters.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { refCounters } from '@/lib/server/db/schema';
import { jalaliStamp } from './jalali';

export async function nextRef(prefix: 'PF' | 'RQ' | 'OR' | 'LD' | 'WH', date: Date = new Date()): Promise<string> {
  const stamp = jalaliStamp(date);
  const scope = `${prefix}-${stamp}`;
  const rows = await getDb()
    .insert(refCounters)
    .values({ scope, seq: 1 })
    .onConflictDoUpdate({ target: refCounters.scope, set: { seq: sql`${refCounters.seq} + 1` } })
    .returning({ seq: refCounters.seq });
  const seq = rows[0]?.seq ?? 1;
  return `${scope}-${String(seq).padStart(4, '0')}`;
}
