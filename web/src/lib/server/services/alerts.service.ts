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
 *
 * RELIABILITY (W22): claim-then-notify means a failed SMS send used to leave
 * the alert permanently 'triggered' with the customer never actually told —
 * `sendNotification`'s result was discarded outright. Now: a TRANSIENT
 * failure (network/5xx/rate-limit) reverts the claim so the next tick
 * retries; a PERMANENT failure (bad line, unapproved template, missing
 * credentials) is reported but left triggered, since retrying an identical
 * rejected send forever is pointless — see revertAlertClaim's doc comment.
 *
 * CORRECTNESS (W22): a stale price/market value (isStale, set by the
 * price-staleness/market-poll jobs when a feed stops updating) is now
 * excluded from evaluation entirely — firing a customer notification off
 * data the app itself doesn't trust was the exact kind of thing that erodes
 * trust in a "we'll reliably tell you" feature.
 */
import { activeAlertsWithValues, claimAlertForTrigger, revertAlertClaim } from '@/lib/server/repos/alertsRepo';
import { sendNotification, truncateParam, type NotificationSpec } from '@/lib/server/integrations/smsir';
import { reportError } from '@/lib/errors/report';
import { customerNameParam } from '@/lib/server/services/leads.service';
import { formatToman } from '@/lib/utils/format';
import { publicEnv } from '@/lib/validation/env';
import { routes } from '@/lib/routes';

export function alertSmsText(
  who: string | null | undefined,
  label: string,
  value: number,
  op: 'below' | 'above',
  threshold: number,
  link: string,
): string {
  const name = who?.trim() || 'مشتری';
  const dir = op === 'below' ? 'زیر' : 'بالای';
  return `آهن‌تایم: ${name} عزیز، ${label} به ${formatToman(value, false)} تومان رسید (هدف شما: ${dir} ${formatToman(threshold, false)}). مشاهده: ${link}`;
}

export function alertSmsNotification(
  who: string | null | undefined,
  label: string,
  value: number,
  op: 'below' | 'above',
  threshold: number,
  link: string,
): NotificationSpec {
  const dir = op === 'below' ? 'زیر' : 'بالای';
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_PRICE_ALERT',
    params: [
      { name: 'NAME', value: customerNameParam(who) },
      { name: 'LABEL', value: truncateParam(label) },
      { name: 'VALUE', value: truncateParam(formatToman(value, false)) },
      { name: 'DIR', value: dir },
      { name: 'THRESHOLD', value: truncateParam(formatToman(threshold, false)) },
    ],
    fallbackText: alertSmsText(who, label, value, op, threshold, link),
    kind: 'alert',
  };
}

export async function evaluateAlerts(): Promise<number> {
  const rows = await activeAlertsWithValues();
  let fired = 0;
  for (const r of rows) {
    const isStale = r.alert.targetType === 'sku' ? r.skuStale : r.marketStale;
    if (isStale) continue; // W22: never fire off a feed the app itself has flagged unreliable.

    const value = r.alert.targetType === 'sku' ? r.skuPrice : r.marketValue;
    if (value == null || value <= 0) continue;
    const crossed = r.alert.op === 'below' ? value <= r.alert.threshold : value >= r.alert.threshold;
    if (!crossed) continue;

    const claimed = await claimAlertForTrigger(r.alert.id);
    if (!claimed) continue; // another concurrent evaluator already fired this one

    const label = r.skuName ?? r.marketLabel ?? 'شاخص';
    const link =
      r.alert.targetType === 'sku' && r.skuSlug && r.skuCategoryId && r.skuSubCategoryId
        ? `${publicEnv.NEXT_PUBLIC_SITE_URL}${routes.sku(r.skuCategoryId, r.skuSubCategoryId, r.skuSlug)}`
        : `${publicEnv.NEXT_PUBLIC_SITE_URL}${routes.market()}`;

    const result = await sendNotification(r.mobile, alertSmsNotification(r.name, label, value, r.alert.op, r.alert.threshold, link));
    if (!result.ok) {
      reportError(new Error('price alert notification failed to send'), {
        alertId: r.alert.id,
        permanent: result.permanent ?? false,
      });
      if (!result.permanent) {
        // Transient (network blip, 429, temporary provider outage): the
        // customer was never actually told — un-claim so the next 60s tick
        // retries, instead of silently losing the notification forever.
        await revertAlertClaim(r.alert.id);
        continue;
      }
      // Permanent (bad line/template/credentials): retrying is pointless
      // until a human fixes config, but the crossing genuinely happened —
      // leave it triggered rather than retry-loop against a guaranteed
      // rejection every tick.
    }
    fired++;
  }
  return fired;
}
