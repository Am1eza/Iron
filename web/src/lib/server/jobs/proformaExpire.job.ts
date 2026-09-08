/** Sweep expired proformas (validUntil passed) every 10 minutes, then send
 *  the expiry SMS the reminder job never covers (audit item 96) — a customer
 *  who missed the 24h-before reminder currently only finds out by clicking a
 *  now-dead link. */
import { expireDueProformas, recentlyExpiredProformasForSms } from '@/lib/server/repos/leadsRepo';
import { smsAutomationsSetting } from './smsAutomation.job';
import { sendSmsOnce } from './smsDedup';
import { customerNameParam } from '@/lib/server/services/leads.service';
import { truncateParam } from '@/lib/server/integrations/smsir';
import { formatToman } from '@/lib/utils/format';
import type { Job } from './scheduler';

// Comfortably covers a missed tick or two of this 10-minute job without
// reaching back into old history — see recentlyExpiredProformasForSms.
const EXPIRY_SMS_WINDOW_MS = 2 * 60 * 60 * 1000;

async function proformaExpirySms(): Promise<void> {
  const cfg = await smsAutomationsSetting();
  // `!== false`: a production settings row saved before this toggle existed
  // has no `proformaExpired` key at all — treating that as "on" (rather than
  // falling back to a DEFAULT_SMS_AUTOMATIONS the stored row already
  // overrides) is what actually ships the fix instead of silently disabling
  // it for every site with a pre-existing SMS_AUTOMATIONS row.
  if (cfg.proformaExpired === false) return;
  const rows = await recentlyExpiredProformasForSms(EXPIRY_SMS_WINDOW_MS);
  for (const r of rows) {
    const who = r.contactName?.trim() || 'مشتری';
    const text = `آهن‌تایم: ${who} عزیز، اعتبار پیش‌فاکتور ${r.ref} (${formatToman(r.total)}) به پایان رسید. برای دریافت قیمت جدید: ahantime.com`;
    await sendSmsOnce(`pf-expired:${r.ref}`, r.mobile, {
      templateEnvVar: 'SMSIR_TEMPLATE_ID_PROFORMA_EXPIRED',
      params: [
        { name: 'NAME', value: customerNameParam(r.contactName) },
        { name: 'REF', value: truncateParam(r.ref) },
        { name: 'AMOUNT', value: truncateParam(formatToman(r.total, false)) },
      ],
      fallbackText: text,
      kind: 'proforma',
    });
  }
}

export const proformaExpireJob: Job = {
  name: 'proforma-expire',
  everyMs: 10 * 60 * 1000,
  run: async () => {
    await expireDueProformas();
    await proformaExpirySms();
  },
};
