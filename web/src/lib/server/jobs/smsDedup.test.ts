// @vitest-environment node
/**
 * Claim-before-send atomicity (item 97). The old check-then-send-then-mark
 * pattern left a real window: a crash between a successful send and its own
 * marker-row write meant the NEXT tick's dedup check found nothing and
 * re-sent. This is a simplified simulation of exactly that crash — a claim
 * that is never followed by a marker write (the crash) must still block a
 * second concurrent/later attempt with the same key.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';
import { sendSmsOnce } from './smsDedup';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetCircuitBreakers();
});

const spec = {
  templateEnvVar: 'SMSIR_TEMPLATE_ID_PROFORMA_REMINDER',
  params: [],
  fallbackText: 'یادآوری',
  kind: 'proforma' as const,
};

describe('sendSmsOnce', () => {
  it('sends once and claims the key, then is a no-op on a same-key retry', async () => {
    const key = `pf-reminder:PF-${Date.now()}-1`;
    const mobile = '09121230001';

    await sendSmsOnce(key, mobile, spec);
    await sendSmsOnce(key, mobile, spec);

    const rows = await db
      .select()
      .from(schema.smsLog)
      .where(eq(schema.smsLog.to, mobile));
    // Exactly one marker row for this dedup key, despite two calls.
    expect(rows.filter((r) => (r.payload as { auto?: string } | null)?.auto === key)).toHaveLength(1);
  });

  it('a claim left pending (simulating a crash before the marker write) still blocks a second send', async () => {
    // Simulates sendSmsOnce having claimed the key and sent successfully,
    // then crashing before its own `smsLog` marker insert — the exact
    // crash window item 97 describes. The claim row itself is what must
    // survive and block the retry, independent of the marker row.
    const key = `pf-reminder:PF-crash-${Date.now()}`;
    const mobile = '09121230002';
    await db.insert(schema.idempotencyKeys).values({ key: `sms-auto:${key}`, route: 'sms-auto', status: 'pending' });

    await sendSmsOnce(key, mobile, spec);

    const rows = await db
      .select()
      .from(schema.smsLog)
      .where(eq(schema.smsLog.to, mobile));
    expect(rows).toHaveLength(0); // never sent — the pre-existing claim won
  });

  it('releases the claim on a genuine send failure so the next tick can retry', async () => {
    const key = `pf-reminder:PF-fail-${Date.now()}`;
    const mobile = '09121230003';
    // Force sendNotification into production's fail-closed path (missing
    // SMSIR_API_KEY/line) instead of the dev auto-ok log path.
    vi.stubEnv('NODE_ENV', 'production');

    await sendSmsOnce(key, mobile, spec);
    const claimAfterFailure = await db
      .select()
      .from(schema.idempotencyKeys)
      .where(eq(schema.idempotencyKeys.key, `sms-auto:${key}`));
    expect(claimAfterFailure).toHaveLength(0); // released, not stuck forever

    vi.unstubAllEnvs();
    await sendSmsOnce(key, mobile, spec); // retry succeeds now that the claim was released

    const rows = await db
      .select()
      .from(schema.smsLog)
      .where(eq(schema.smsLog.to, mobile));
    // Exactly one dedup marker for this key — the failed first attempt left
    // its own 'failed' log row (unrelated to dedup, always written by
    // sendSms) but never a marker, since release() only fires on failure.
    expect(rows.filter((r) => (r.payload as { auto?: string } | null)?.auto === key)).toHaveLength(1);
  });

  it('two different dedup keys never collide', async () => {
    const mobile = '09121230004';
    const keyA = `pf-reminder:PF-a-${Date.now()}`;
    const keyB = `pf-reminder:PF-b-${Date.now()}`;
    await sendSmsOnce(keyA, mobile, spec);
    await sendSmsOnce(keyB, mobile, spec);

    const rows = await db
      .select()
      .from(schema.smsLog)
      .where(eq(schema.smsLog.to, mobile));
    const markerKeys = rows.map((r) => (r.payload as { auto?: string } | null)?.auto).filter(Boolean);
    expect(markerKeys.sort()).toEqual([keyA, keyB].sort());
  });
});
