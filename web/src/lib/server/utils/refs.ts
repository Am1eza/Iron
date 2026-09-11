/**
 * Human reference generator — `PF-14050410-0021-K7X9ABQR9M42` style: prefix +
 * Jalali date stamp (Tehran) + a per-day atomic sequence from ref_counters
 * (for human ordering/admin sanity) + a crypto-random suffix.
 *
 * SECURITY: refs double as bearer capabilities for unauthenticated public
 * lookups (`/api/proforma/[ref]`, `/api/track/[ref]`) — a customer's full
 * quote (line items, prices, totals) or shipment is readable to anyone who
 * knows the ref. A sequential `PF-20260702-0001` counter alone is trivially
 * enumerable (iterate 0001..9999 for a known date). The random suffix below
 * is the actual unguessability guarantee; the counter is cosmetic.
 *
 * E-105 (audit-order-warehouse-E.md): the original suffix was 6 chars ≈
 * 29.4 bits (~9.3e8 combinations) — flagged as too low against `/api/track`'s
 * 30 req/min rate limit (distributed across enough source IPs, that keyspace
 * is exhaustible in days, not centuries). Widened to `REF_SUFFIX_LENGTH = 12`
 * chars ≈ 58.9 bits (~6.8e17 combinations) for every ref minted from here on.
 * This is a lookup-key length change, not a schema/format change — `ref` is
 * matched by plain string equality (see findOrderByRef/proforma lookup, no
 * fixed-length regex anywhere), so it is fully backward compatible: refs
 * already issued with the old 6-char suffix keep resolving exactly as
 * before, forever. Do not shrink REF_SUFFIX_LENGTH below what yields at
 * least ~55 bits (see refs.test.ts, which asserts this arithmetically so a
 * future edit here can't silently regress it).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { refCounters } from '@/lib/server/db/schema';
import { jalaliStamp } from './jalali';

// Crockford-ish base32 minus visually ambiguous chars (0/O, 1/I/L, U) —
// 30 symbols.
export const REF_SUFFIX_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
// 12 chars * log2(30) ≈ 58.9 bits of entropy per newly generated ref.
export const REF_SUFFIX_LENGTH = 12;

/** Cryptographically-random, human-readable suffix (unguessable capability). */
export function randomRefSuffix(length = REF_SUFFIX_LENGTH): string {
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
