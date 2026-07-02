/**
 * Alert evaluation — active alerts whose target crossed the threshold fire
 * once: status → triggered, lastTriggeredAt stamped, SMS sent (other channels
 * are recorded in sms_log until those integrations land). Users re-arm from
 * the account page.
 *
 * CONCURRENCY: this runs both from the 60s scheduled job AND inline after an
 * admin price save (`PUT /api/admin/pricing`), so two invocations can race
 * on the SAME alert (e.g. a bulk save landing between two job ticks). We
 * claim-then-notify (atomic CAS UPDATE first, SMS only if the claim wins) —
 * NOT notify-then-mark — so at most one of the two racing calls ever sends
 * the SMS, regardless of scheduler-level locking.
 */
import { activeAlertsWithValues, claimAlertForTrigger } from '@/lib/server/repos/alertsRepo';
import { sendRawSms } from '@/lib/server/integrations/kavenegar';
import { formatToman } from '@/lib/utils/format';

export async function evaluateAlerts(): Promise<number> {
  const rows = await activeAlertsWithValues();
  let fired = 0;
  for (const r of rows) {
    const value = r.alert.targetType === 'sku' ? r.skuPrice : r.marketValue;
    if (value == null || value <= 0) continue;
    const crossed = r.alert.op === 'below' ? value <= r.alert.threshold : value >= r.alert.threshold;
    if (!crossed) continue;

    const claimed = await claimAlertForTrigger(r.alert.id);
    if (!claimed) continue; // another concurrent evaluator already fired this one

    const label = r.skuName ?? r.marketLabel ?? 'شاخص';
    const text = `آهن‌تایم: ${label} به ${formatToman(value, false)} تومان رسید (هدف شما: ${r.alert.op === 'below' ? 'زیر' : 'بالای'} ${formatToman(r.alert.threshold, false)}). ahantime.com`;
    // Non-SMS channels aren't integrated yet — the send is recorded either way.
    await sendRawSms(r.mobile, text, 'alert');
    fired++;
  }
  return fired;
}
