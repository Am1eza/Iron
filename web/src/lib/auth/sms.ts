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

/** Send an OTP code to a mobile. Returns ok even on provider hiccups we retry.
 *  SMS.ir is the ONLY OTP provider — an owner decision (a Kavenegar adapter
 *  was briefly added and removed on their explicit instruction; do not
 *  reintroduce alternative providers without being asked). */
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
    // A response body that isn't parseable JSON (or has no numeric `status`)
    // is NOT treated as success — it used to be (the missing-body case fell
    // through to the success path below), which meant a malformed/empty 2xx
    // response from sms.ir was silently logged and reported as a code
    // successfully sent with no visibility into the real outcome.
    const body = (await res.json().catch(() => null)) as {
      status?: number;
      data?: { messageId?: number };
    } | null;
    if (typeof body?.status !== 'number' || body.status !== 1) {
      reportError(
        new Error(body ? `sms.ir status ${body.status}` : 'sms.ir verify: unparseable response body'),
        { scope: 'sms' },
      );
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
 *  fires. 30s (was 60s): measured 2026-07-24, a verify-line send that hasn't
 *  confirmed within ~30s is riding the multi-minute (or dead) path — waiting
 *  longer only delays the second line. 0 (or no SMSIR_LINE_NUMBER to send
 *  from) disables the watchdog. */
// `||` not `??`: compose passes the var as an EMPTY STRING when unset in
// .env, and Number('') is 0 — which silently disabled the watchdog once.
// Empty/undefined → default; an explicit '0' still disables.
const FALLBACK_AFTER_MS = Number(process.env.OTP_FALLBACK_AFTER_MS || 30_000);

/** Second-stage re-check delay (after the fallback send): if NEITHER message
 *  confirmed delivery by then, fire one final verify-line resend of the SAME
 *  code. Three total attempts across both lines, then stop — the code stays
 *  valid for OTP_TTL_SECONDS, so a late-arriving SMS still logs the user in. */
const SECOND_CHECK_AFTER_MS = 120_000;

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

/** One final verify-line resend of the same code — used by the second-stage
 *  watchdog when both earlier sends are still unconfirmed. Exported for tests. */
export async function resendVerify(mobile: string, code: string, apiKey: string): Promise<boolean> {
  const templateId = process.env.SMSIR_TEMPLATE_ID;
  if (!templateId) return false;
  try {
    const paramName = process.env.SMSIR_TEMPLATE_PARAM || 'OTP';
    const res = await fetch('https://api.sms.ir/v1/send/verify/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ Mobile: mobile, TemplateId: Number(templateId), Parameters: [{ name: paramName, value: code }] }),
      signal: AbortSignal.timeout(8000),
    });
    // Same reasoning as sendOtpSms above — an unparseable body must not read
    // as success just because the HTTP status was 2xx.
    const body = (await res.json().catch(() => null)) as { status?: number } | null;
    return res.ok && typeof body?.status === 'number' && body.status === 1;
  } catch {
    return false;
  }
}

function scheduleDeliveryWatchdog(mobile: string, code: string, messageId: number, apiKey: string): void {
  if (FALLBACK_AFTER_MS <= 0 || !process.env.SMSIR_LINE_NUMBER) return;
  const timer = setTimeout(() => {
    void checkDeliveryAndFallback(mobile, code, messageId, apiKey)
      .then((outcome) => {
        if (outcome !== 'fallback_sent') return;
        // Stage 2: both sends are in flight; if the ORIGINAL still has no
        // delivery confirmation after two more minutes, fire one last
        // verify-line attempt and stop (3 sends max per request).
        const second = setTimeout(() => {
          void (async () => {
            try {
              const res = await fetch(`https://api.sms.ir/v1/send/${messageId}`, {
                headers: { Accept: 'application/json', 'x-api-key': apiKey },
                signal: AbortSignal.timeout(8000),
              });
              const body = (await res.json().catch(() => null)) as { data?: { deliveryState?: number | null } } | null;
              if (body?.data?.deliveryState === 1) return; // landed after all
            } catch {
              /* report unavailable → assume undelivered */
            }
            await resendVerify(mobile, code, apiKey);
          })().catch(() => {});
        }, SECOND_CHECK_AFTER_MS);
        (second as { unref?: () => void }).unref?.();
      })
      .catch(() => {});
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
