/**
 * SMS delivery — SMS.ir Verify API in live mode (the locked provider), a console
 * logger in dev so the OTP flow works without credentials. Server-only. Never
 * throws to the caller in a way that leaks provider details to the client.
 */
import { reportError } from '@/lib/errors/report';

export interface SmsResult {
  ok: boolean;
  /** In dev only, the code is surfaced so the UI can show a hint. */
  devCode?: string;
}

/** Send an OTP code to a mobile. Returns ok even on provider hiccups we retry. */
export async function sendOtpSms(mobile: string, code: string): Promise<SmsResult> {
  const apiKey = process.env.SMSIR_API_KEY;
  const templateId = process.env.SMSIR_TEMPLATE_ID;

  // Missing credentials in production is a deploy misconfiguration, not a valid
  // "dev mode" — fail loudly instead of silently claiming an SMS was sent (the
  // caller would otherwise tell every user "a code was texted to you" while
  // nobody can ever receive one).
  if ((!apiKey || !templateId) && process.env.NODE_ENV === 'production') {
    reportError(new Error('SMSIR_API_KEY or SMSIR_TEMPLATE_ID missing in production'), {
      scope: 'sms',
    });
    return { ok: false };
  }

  // Dev / unconfigured: log instead of sending; surface the code for local testing.
  if (!apiKey || !templateId) {
    // eslint-disable-next-line no-console
    console.info(`[sms:dev] OTP for ${mobile} = ${code}`);
    return { ok: true, devCode: code };
  }

  try {
    // SMS.ir Verify (templated OTP) API. Body shape and the trailing slash on
    // the URL are verified against the official SDK sources
    // (github.com/IPeCompany/SmsPanelV2.nodejs and SmsPanelV2.Python — the
    // Python SDK builds `Parameters: [{name, value}]`). Kept on native
    // `fetch` rather than adopting the node SDK directly: it hard-depends on
    // axios, which does not work on Cloudflare Workers (this app's other
    // deployment target); `fetch` works identically on both targets.
    //
    // CRITICAL CONTRACT: the parameter `name` must equal the placeholder in
    // the registered panel template EXACTLY (the text between the # signs).
    // Template 577070 reads «کد تایید شما #OTP# است» → the name is "OTP".
    // Any other name makes SMS.ir deliver the LITERAL «#OTP#» to the user
    // (observed in production with the previous 'Code'). Override via
    // SMSIR_TEMPLATE_PARAM if the template is ever re-registered differently.
    const paramName = process.env.SMSIR_TEMPLATE_PARAM || 'OTP';
    const res = await fetch('https://api.sms.ir/v1/send/verify/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        Mobile: mobile,
        TemplateId: Number(templateId),
        Parameters: [{ name: paramName, value: code }],
      }),
      // Bound the external call — a slow/hung SMS.ir must not stall the login
      // request (the OTP is already stored, so failing fast lets the user retry).
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      reportError(new Error(`sms.ir ${res.status}`), { scope: 'sms' });
      await logOtpSend(mobile, false);
      return { ok: false };
    }
    // sms.ir returns { status, message, data } — status 1 means accepted.
    const body = (await res.json().catch(() => null)) as {
      status?: number;
      data?: { messageId?: number };
    } | null;
    if (body && typeof body.status === 'number' && body.status !== 1) {
      reportError(new Error(`sms.ir status ${body.status}`), { scope: 'sms' });
      await logOtpSend(mobile, false);
      return { ok: false };
    }
    await logOtpSend(mobile, true);
    // Delivery watchdog: accepted ≠ delivered. Measured latency on Iranian
    // MVNOs (Shatel via the shared verify line) runs to ~5 minutes — long
    // enough to lose the customer. If the delivery report hasn't confirmed
    // handset delivery shortly, re-send the SAME code over the second route.
    const messageId = body?.data?.messageId;
    if (messageId) scheduleDeliveryWatchdog(mobile, code, messageId, apiKey);
    return { ok: true };
  } catch (err) {
    reportError(err, { scope: 'sms' });
    await logOtpSend(mobile, false);
    return { ok: false };
  }
}

/* ------------------------- delivery watchdog ------------------------- */

/** How long to wait for a positive delivery report before the fallback path
 *  fires. Tuned against measured SMS.ir DLR behavior: fast routes confirm in
 *  well under a minute; anything later is the multi-minute MVNO path. 0 (or
 *  no SMSIR_LINE_NUMBER to send from) disables the watchdog. */
// `||` not `??`: compose passes the var as an EMPTY STRING when unset in
// .env, and Number('') is 0 — which silently disabled the watchdog once.
// Empty/undefined → default; an explicit '0' still disables.
const FALLBACK_AFTER_MS = Number(process.env.OTP_FALLBACK_AFTER_MS || 60_000);

/** The registered verify template's text, reproduced for the fallback bulk
 *  send — must stay in sync with template 577070 on the SMS.ir panel. */
const otpText = (code: string) =>
  `آهن‌تایم: کد تایید شما ${code} است.\nبرای ورود به حساب خود از این کد استفاده کنید.\nاین کد محرمانه است.\nahantime.com`;

/**
 * Check the delivery report for one sent OTP; if the handset delivery is not
 * confirmed, push the SAME code through the bulk endpoint on our own line —
 * a different carrier route than the shared verify line. Exported for tests.
 * Returns what happened so tests can assert without observing side effects.
 */
export async function checkDeliveryAndFallback(
  mobile: string,
  code: string,
  messageId: number,
  apiKey: string,
): Promise<'delivered' | 'fallback_sent' | 'fallback_failed' | 'skipped'> {
  if (!process.env.SMSIR_LINE_NUMBER) return 'skipped';
  try {
    const res = await fetch(`https://api.sms.ir/v1/send/${messageId}`, {
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => null)) as {
      data?: { deliveryState?: number | null };
    } | null;
    if (body?.data?.deliveryState === 1) return 'delivered';
  } catch {
    /* report unavailable → assume undelivered and fall through to fallback */
  }
  // Same code, second route. The OTP store keeps this code valid regardless
  // of which SMS lands first (and a later resend keeps it as prevHash).
  const { sendSms } = await import('@/lib/server/integrations/smsir');
  const { ok } = await sendSms(mobile, otpText(code), 'otp');
  return ok ? 'fallback_sent' : 'fallback_failed';
}

function scheduleDeliveryWatchdog(mobile: string, code: string, messageId: number, apiKey: string): void {
  if (FALLBACK_AFTER_MS <= 0 || !process.env.SMSIR_LINE_NUMBER) return;
  const timer = setTimeout(() => {
    void checkDeliveryAndFallback(mobile, code, messageId, apiKey).catch(() => {});
  }, FALLBACK_AFTER_MS);
  // Never hold the process open for a watchdog (graceful shutdown stays fast;
  // a lost watchdog on restart is fine — the user just taps resend).
  (timer as { unref?: () => void }).unref?.();
}

/** Best-effort sms_log row (kind 'otp') so delivery stats in the admin
 *  marketing dashboard cover OTP traffic too. NEVER contains the code, and
 *  never fails the send path — logging is observability, not correctness. */
async function logOtpSend(mobile: string, ok: boolean): Promise<void> {
  try {
    const { hasDb, getDb } = await import('@/lib/server/db/client');
    if (!hasDb()) return;
    const { smsLog } = await import('@/lib/server/db/schema');
    const { ulid } = await import('ulid');
    await getDb()
      .insert(smsLog)
      .values({ id: ulid(), to: mobile, kind: 'otp', payload: { template: 'verify' }, status: ok ? 'sent' : 'failed' });
  } catch {
    /* observability only */
  }
}
