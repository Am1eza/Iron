/**
 * گزارش هفتگی مدیر — every Saturday morning (Tehran), one SMS to the owner's
 * mobile (SITE_CONTACT.phoneMobile) summarizing the past 7 days: proformas
 * issued + total value, new leads, won leads, new orders, new users.
 *
 * Rides the same 30-minute scheduler tick + sms_log dedup pattern as the
 * other automations (see smsAutomation.job.ts): the tick checks "is it
 * Saturday ≥08:00 Tehran and has THIS week's report not been sent yet" —
 * restarts and overlapping replicas can never double-send. Toggleable from
 * settings (SMS_AUTOMATIONS.weeklyReport).
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { leads, orders, proformas, smsLog, users } from '@/lib/server/db/schema';
import { sendSms } from '@/lib/server/integrations/smsir';
import { getContact } from '@/lib/server/contact';
import { formatTomanCompact, toPersianDigits } from '@/lib/utils/format';
import { smsAutomationsSetting } from './smsAutomation.job';
import type { Job } from './scheduler';

/** Tehran is a FIXED UTC+3:30 (Iran abolished DST in 2022). */
function tehranNow(): { day: number; hour: number; weekKey: string } {
  const t = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
  // A stable per-week key from the UTC-shifted date — constant across the
  // whole Tehran Saturday, which is all the dedup needs.
  const year = t.getUTCFullYear();
  const dayOfYear = Math.floor((t.getTime() - Date.UTC(year, 0, 0)) / 86_400_000);
  return { day: t.getUTCDay(), hour: t.getUTCHours(), weekKey: `${year}-w${Math.ceil(dayOfYear / 7)}` };
}

async function alreadySent(dedupKey: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: smsLog.id })
    .from(smsLog)
    .where(sql`${smsLog.payload}->>'auto' = ${dedupKey}`)
    .limit(1);
  return rows.length > 0;
}

async function runWeeklyReport(): Promise<void> {
  const cfg = await smsAutomationsSetting();
  if (!cfg.weeklyReport) return;

  const { day, hour, weekKey } = tehranNow();
  // Saturday (shifted-clock getUTCDay = 6) from 08:00 Tehran onward.
  if (day !== 6 || hour < 8) return;
  const dedupKey = `weekly-report:${weekKey}`;
  if (await alreadySent(dedupKey)) return;

  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);

  const [pfAgg, newLeads, wonLeads, newOrders, newUsers] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${proformas.total}), 0)::bigint` })
      .from(proformas)
      .where(gte(proformas.createdAt, since))
      .then((r) => r[0] ?? { n: 0, total: 0 }),
    count(db.select({ n: sql<number>`count(*)::int` }).from(leads).where(gte(leads.createdAt, since))),
    count(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(and(eq(leads.status, 'won'), gte(leads.updatedAt, since))),
    ),
    count(db.select({ n: sql<number>`count(*)::int` }).from(orders).where(gte(orders.placedAt, since))),
    count(db.select({ n: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, since))),
  ]);

  const contact = await getContact();
  const to = contact.phoneMobile;
  if (!to) return;

  const text =
    `آهن‌تایم — گزارش هفتگی:\n` +
    `پیش‌فاکتور: ${toPersianDigits(pfAgg.n)} عدد (${formatTomanCompact(Number(pfAgg.total))} تومان)\n` +
    `سرنخ جدید: ${toPersianDigits(newLeads)} · موفق: ${toPersianDigits(wonLeads)}\n` +
    `سفارش جدید: ${toPersianDigits(newOrders)} · کاربر جدید: ${toPersianDigits(newUsers)}\n` +
    `panel.ahantime.com`;

  const { ok } = await sendSms(to, text, 'generic');
  if (!ok) return; // retry on a later tick (still Saturday) — dedup not stamped yet
  const { ulid } = await import('ulid');
  await db.insert(smsLog).values({ id: ulid(), to, kind: 'generic', payload: { auto: dedupKey }, status: 'sent' });
}

export const weeklyReportJob: Job = {
  name: 'weekly-report',
  everyMs: 30 * 60 * 1000,
  run: runWeeklyReport,
};
