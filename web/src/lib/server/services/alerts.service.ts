/**
 * Alert evaluation — active alerts whose target crossed the threshold fire
 * once: status → triggered, lastTriggeredAt stamped, SMS sent (other channels
 * are recorded in sms_log until those integrations land). Users re-arm from
 * the account page.
 */
import { activeAlertsWithValues, updateAlertStatus } from '@/lib/server/repos/alertsRepo';
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

    const label = r.skuName ?? r.marketLabel ?? 'شاخص';
    const text = `آهن‌تایم: ${label} به ${formatToman(value, false)} تومان رسید (هدف شما: ${r.alert.op === 'below' ? 'زیر' : 'بالای'} ${formatToman(r.alert.threshold, false)}). ahantime.com`;
    // Non-SMS channels aren't integrated yet — the send is recorded either way.
    await sendRawSms(r.mobile, text, 'alert');
    await updateAlertStatus(r.alert.id, 'triggered', new Date());
    fired++;
  }
  return fired;
}
