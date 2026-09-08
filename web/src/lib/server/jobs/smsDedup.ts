/**
 * Atomic claim-before-send for automated SMS (proforma reminders, expiry
 * notices, callback nudges). Reuses `idempotencyKeys` — the same
 * claim-before-write primitive api/leads and proforma issuance already rely
 * on (see lib/server/utils/idempotency.ts) — instead of the old
 * check-then-send-then-mark pattern that queried `sms_log` for a prior send.
 * That pattern left a real window: a crash between a successful send and its
 * own marker-row write meant the next tick's `alreadySent()` check found
 * nothing and re-sent the same SMS. Claiming BEFORE the send closes it.
 */
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { idempotencyKeys, smsLog } from '@/lib/server/db/schema';
import { sendNotification, type NotificationSpec } from '@/lib/server/integrations/smsir';

const ROUTE = 'sms-auto';

async function claim(dedupKey: string): Promise<boolean> {
  const claimed = await getDb()
    .insert(idempotencyKeys)
    .values({ key: `${ROUTE}:${dedupKey}`, route: ROUTE, status: 'pending' })
    .onConflictDoNothing({ target: idempotencyKeys.key })
    .returning({ key: idempotencyKeys.key });
  return claimed.length > 0;
}

async function release(dedupKey: string): Promise<void> {
  await getDb().delete(idempotencyKeys).where(eq(idempotencyKeys.key, `${ROUTE}:${dedupKey}`));
}

/**
 * Claims `dedupKey` before sending. A no-op if another tick/replica already
 * holds or completed the claim. On a genuine provider failure the claim is
 * released so the next tick can retry — same "failed sends may retry next
 * tick" contract the old check-then-send code documented.
 */
export async function sendSmsOnce(dedupKey: string, mobile: string, spec: NotificationSpec): Promise<void> {
  if (!(await claim(dedupKey))) return;
  const { ok } = await sendNotification(mobile, spec);
  if (!ok) {
    await release(dedupKey);
    return;
  }
  await getDb().insert(smsLog).values({
    id: ulid(),
    to: mobile,
    kind: spec.kind,
    payload: { auto: dedupKey },
    status: 'sent',
  });
}
