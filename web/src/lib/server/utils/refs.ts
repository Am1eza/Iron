/**
 * Human reference generator — `PF-14050410-0021-K7X9AB` style: prefix +
 * Jalali date stamp (Tehran) + a per-day atomic sequence from ref_counters
 * (for human ordering/admin sanity) + a crypto-random suffix.
 *
 * SECURITY: refs double as bearer capabilities for unauthenticated public
 * lookups (`/api/proforma/[ref]`, `/api/track/[ref]`) — a customer's full
 * quote (line items, prices, totals) or shipment is readable to anyone who
 * knows the ref. A sequential `PF-20260702-0001` counter alone is trivially
 * enumerable (iterate 0001..9999 for a known date). The random suffix below
 * is the actual unguessability guarantee; the counter is cosmetic. Do not
 * remove the suffix or shrink it below ~30 bits of entropy.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { refCounters } from '@/lib/server/db/schema';
import { jalaliStamp } from './jalali';

// Crockford-ish base32 minus visually ambiguous chars (0/O, 1/I/L, U) —
// 30 symbols; 6 chars ≈ 29.4 bits (~9.3e8 combinations), still short enough
// to read off an SMS.
const REF_SUFFIX_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Cryptographically-random, human-readable suffix (unguessable capability). */
function randomRefSuffix(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += REF_SUFFIX_ALPHABET[bytes[i]! % REF_SUFFIX_ALPHABET.length];
  }
  return out;
}

export async function nextRef(prefix: 'PF' | 'RQ' | 'OR' | 'LD' | 'WH', date: Date = new Date()): Promise<string> {
  const stamp = jalaliStamp(date);
  const scope = `${prefix}-${stamp}`;
  const rows = await getDb()
    .insert(refCounters)
    .values({ scope, seq: 1 })
    .onConflictDoUpdate({ target: refCounters.scope, set: { seq: sql`${refCounters.seq} + 1` } })
    .returning({ seq: refCounters.seq });
  const seq = rows[0]?.seq ?? 1;
  return `${scope}-${String(seq).padStart(4, '0')}-${randomRefSuffix()}`;
}
