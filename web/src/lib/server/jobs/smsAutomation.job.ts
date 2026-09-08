/**
 * Automated SMS — the follow-up automations the sales flow needs, running on
 * the in-process scheduler every 30 minutes. Each automation is individually
 * toggleable from settings (SMS_AUTOMATIONS) and every send is deduplicated
 * against sms_log so a restart or overlapping tick can never double-text a
 * customer.
 *
 *  1. proformaReminder — a پیش‌فاکتور expiring within ~24h gets one reminder
 *     to the lead's mobile (validUntil is tomorrow → nudge before it dies).
 *  2. callbackReminder — a lead whose callbackAt window has arrived reminds
 *     the ASSIGNED sales rep (their own mobile) to make the call.
 *
 * (The welcome SMS is not here — it fires inline on first registration in
 * the OTP verify route, where `isNew` is known.)
 */
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { leads, proformas, users } from '@/lib/server/db/schema';
import { getSetting } from '@/lib/server/repos/settingsRepo';
import { truncateParam } from '@/lib/server/integrations/smsir';
import { customerNameParam } from '@/lib/server/services/leads.service';
import { formatToman } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { sendSmsOnce } from './smsDedup';
import type { Job } from './scheduler';

export interface SmsAutomations {
  welcome: boolean;
  proformaReminder: boolean;
  /** انقضای پیش‌فاکتور — sent the moment a quote actually expires, distinct
   *  from `proformaReminder` (24h-before nudge). See proformaExpire.job.ts. */
  proformaExpired: boolean;
  callbackReminder: boolean;
  /** گزارش هفتگی مدیر — Saturday-morning summary SMS (weeklyReport.job.ts). */
  weeklyReport: boolean;
}

export const DEFAULT_SMS_AUTOMATIONS: SmsAutomations = {
  welcome: true,
  proformaReminder: true,
  proformaExpired: true,
  callbackReminder: true,
  weeklyReport: true,
};

export const smsAutomationsSetting = () =>
  getSetting<SmsAutomations>('SMS_AUTOMATIONS', DEFAULT_SMS_AUTOMATIONS);

async function proformaReminders(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // Active proformas whose validity ends within the next 24h.
  const rows = await db
    .select({
      ref: proformas.ref,
      total: proformas.total,
      validUntil: proformas.validUntil,
      mobile: leads.contactMobile,
      contactName: leads.contactName,
    })
    .from(proformas)
    .innerJoin(leads, eq(leads.id, proformas.leadId))
    .where(and(eq(proformas.status, 'active'), gte(proformas.validUntil, now), lte(proformas.validUntil, in24h)))
    .limit(50);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';
  for (const r of rows) {
    const who = r.contactName?.trim() || 'مشتری';
    const text = `آهن‌تایم: ${who} عزیز، اعتبار پیش‌فاکتور ${r.ref} (${formatToman(r.total)}) تا ${formatJalali(r.validUntil)} است. برای نهایی‌کردن: ${site}/proforma/${r.ref}`;
    // Templated the moment SMSIR_TEMPLATE_ID_PROFORMA_REMINDER is set — see
    // docs/SMS-TEMPLATES.md; falls back to `text` above until then.
    await sendSmsOnce(`pf-reminder:${r.ref}`, r.mobile, {
      templateEnvVar: 'SMSIR_TEMPLATE_ID_PROFORMA_REMINDER',
      params: [
        { name: 'NAME', value: customerNameParam(r.contactName) },
        { name: 'REF', value: truncateParam(r.ref) },
        { name: 'AMOUNT', value: truncateParam(formatToman(r.total, false)) },
        { name: 'EXPIRY', value: truncateParam(formatJalali(r.validUntil)) },
      ],
      fallbackText: text,
      kind: 'proforma',
    });
  }
}

async function callbackReminders(): Promise<void> {
  const db = getDb();
  const now = new Date();
  // Callbacks due today (window: past-due but within the last 24h so we never
  // nag about ancient forgotten ones) on still-open leads with an assignee.
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: leads.id,
      ref: leads.ref,
      contactName: leads.contactName,
      contactMobile: leads.contactMobile,
      callbackAt: leads.callbackAt,
      repMobile: users.mobile,
    })
    .from(leads)
    .innerJoin(users, eq(users.id, leads.assigneeId))
    .where(
      and(
        isNotNull(leads.callbackAt),
        gte(leads.callbackAt, dayAgo),
        lte(leads.callbackAt, now),
        sql`${leads.status} IN ('new','contacted')`,
        sql`${leads.deletedAt} IS NULL`,
      ),
    )
    .limit(50);
  for (const r of rows) {
    const who = r.contactName ? `${r.contactName} (${r.contactMobile})` : r.contactMobile;
    const text = `آهن‌تایم: یادآوری تماس — سرنخ ${r.ref}، ${who}. پنل: /admin/desk`;
    // Internal (staff-to-staff), low-priority — left on the free-text bulk
    // line rather than a registered template; the env var still exists so it
    // upgrades for free if one is ever added, same as everything else here.
    await sendSmsOnce(`cb-reminder:${r.id}:${r.callbackAt?.toISOString().slice(0, 10)}`, r.repMobile, {
      templateEnvVar: 'SMSIR_TEMPLATE_ID_CALLBACK_REMINDER',
      // NAME here is the LEAD's name (who the rep is calling), not the rep's
      // own — SMS.ir's personalization rule wants a name variable in every
      // template, and this one is genuinely more useful to the rep than a
      // static «مشتری» filler would be.
      params: [
        { name: 'NAME', value: customerNameParam(r.contactName) },
        { name: 'REF', value: truncateParam(r.ref) },
      ],
      fallbackText: text,
      kind: 'generic',
    });
  }
}

export const smsAutomationJob: Job = {
  name: 'sms-automation',
  everyMs: 30 * 60 * 1000,
  run: async () => {
    const cfg = await smsAutomationsSetting();
    if (cfg.proformaReminder) await proformaReminders();
    if (cfg.callbackReminder) await callbackReminders();
  },
};
