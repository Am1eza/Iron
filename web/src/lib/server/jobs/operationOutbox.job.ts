import { and, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { operationOutbox } from '@/lib/server/db/schema';
import { sendNotification, sendSms } from '@/lib/server/integrations/smsir';
import type { Job } from './scheduler';

/** An ambiguous provider response needs reconciliation, never a blind resend. */
export const operationOutboxJob: Job = {
  name: 'operation-outbox', everyMs: 30_000,
  async run() {
    await getDb().update(operationOutbox).set({ status: 'uncertain', lastError: 'پردازش هنگام ارسال قطع شد؛ رسید سرویس پیامک بررسی شود.' })
      .where(and(eq(operationOutbox.status, 'sending'), sql`${operationOutbox.claimedAt}<now()-interval '5 minutes'`));
    for (let i = 0; i < 20; i++) {
      const claimed = await getDb().transaction(async tx => {
        const [row] = await tx.select().from(operationOutbox).where(and(eq(operationOutbox.status, 'pending'), lte(operationOutbox.nextAttemptAt, new Date())))
          .orderBy(operationOutbox.createdAt).limit(1).for('update', { skipLocked: true });
        if (!row) return null;
        await tx.update(operationOutbox).set({ status: 'sending', claimedAt: new Date(), attempts: row.attempts + 1 }).where(eq(operationOutbox.id, row.id));
        return row;
      });
      if (!claimed) break;
      try {
        const sent = claimed.notification ? await sendNotification(claimed.mobile, claimed.notification) : await sendSms(claimed.mobile, claimed.message);
        await getDb().update(operationOutbox).set({ status: sent.ok ? 'sent' : sent.permanent ? 'failed' : 'uncertain',
          lastError: sent.ok ? null : 'ارسال تأیید نشد؛ پیش از تکرار، گزارش سرویس پیامک بررسی شود.' })
          .where(and(eq(operationOutbox.id, claimed.id), eq(operationOutbox.status, 'sending')));
      } catch {
        await getDb().update(operationOutbox).set({ status: 'uncertain', lastError: 'پاسخ قطعی ارسال دریافت نشد.' }).where(eq(operationOutbox.id, claimed.id));
      }
    }
  },
};
