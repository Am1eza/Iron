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
import { sendNotification, truncateParam } from '@/lib/server/integrations/smsir';
import { customerNameParam } from '@/lib/server/services/leads.service';
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
    const dir = r.alert.op === 'below' ? 'زیر' : 'بالای';
    const who = r.name?.trim() || 'مشتری';
    const text = `آهن‌تایم: ${who} عزیز، ${label} به ${formatToman(value, false)} تومان رسید (هدف شما: ${dir} ${formatToman(r.alert.threshold, false)}). ahantime.com`;
    // Non-SMS channels aren't integrated yet — the send is recorded either way.
    // Templated the moment SMSIR_TEMPLATE_ID_PRICE_ALERT is set — see
    // docs/SMS-TEMPLATES.md; falls back to the free-text `text` above until then.
    await sendNotification(r.mobile, {
      templateEnvVar: 'SMSIR_TEMPLATE_ID_PRICE_ALERT',
      params: [
        { name: 'NAME', value: customerNameParam(r.name) },
        { name: 'LABEL', value: truncateParam(label) },
        { name: 'VALUE', value: truncateParam(formatToman(value, false)) },
        { name: 'DIR', value: dir },
        { name: 'THRESHOLD', value: truncateParam(formatToman(r.alert.threshold, false)) },
      ],
      fallbackText: text,
      kind: 'alert',
    });
    fired++;
  }
  return fired;
}
