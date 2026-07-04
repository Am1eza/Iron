/**
 * SMS.ir bulk send — free-text notifications (پیش‌فاکتور refs, alert
 * crossings), the locked provider (see AUTH.md). OTP uses the separate
 * Verify-template API (`auth/sms.ts`) since a registered template + fixed
 * "Code" placeholder is the right fit for a transactional code; these are
 * fully dynamic composed sentences instead (ref numbers, prices, product
 * names), so the bulk send-to-line endpoint is the right fit — no template
 * to register on the SMS.ir panel. Same dev fallback as the rest of the
 * system (no API key/line → console + sms_log 'dev_logged'), and unlike
 * OTP this does NOT fail closed when unconfigured: a missing proforma/alert
 * text is a degraded UX (the ref is still viewable via its page and mirrored
 * into the account inbox), not a broken login, so it logs and moves on
 * rather than blocking the caller.
 */
import { ulid } from 'ulid';
import { reportError } from '@/lib/errors/report';
import { getDb, hasDb } from '@/lib/server/db/client';
import { smsLog } from '@/lib/server/db/schema';

export type SmsKind = 'otp' | 'proforma' | 'alert' | 'generic';

async function log(to: string, kind: SmsKind, payload: Record<string, unknown>, status: 'sent' | 'failed' | 'dev_logged') {
  if (!hasDb()) return;
  try {
    await getDb().insert(smsLog).values({ id: ulid(), to, kind, payload, status });
  } catch (err) {
    reportError(err, { scope: 'sms_log' });
  }
}

const FETCH_TIMEOUT_MS = 5000;
const isProd = () => process.env.NODE_ENV === 'production';

/** Free-text SMS via SMS.ir's bulk send (POST /v1/send/bulk, one mobile). */
export async function sendSms(mobile: string, text: string, kind: SmsKind = 'generic'): Promise<{ ok: boolean }> {
  const apiKey = process.env.SMSIR_API_KEY;
  const lineNumber = process.env.SMSIR_LINE_NUMBER;
  if (!apiKey || !lineNumber) {
    // PII (mobile + message content) — never echoed to prod stdout, only the
    // DB-backed sms_log (which is access-controlled via the admin panel).
    if (!isProd()) console.info(`[sms:dev] ${kind} → ${mobile}: ${text}`);
    await log(mobile, kind, { text }, 'dev_logged');
    return { ok: true };
  }
  try {
    // Body shape verified against the official `smsir-js` SDK's source
    // (github.com/IPeCompany/SmsPanelV2.nodejs): lineNumber is the one
    // camelCase field, MessageText/Mobiles/SendDateTime are PascalCase — an
    // inconsistent-looking but confirmed-real mix, not a typo. See sms.ts's
    // sendOtpSms for why this stays on `fetch` instead of that SDK directly
    // (axios, which it depends on, does not work on Cloudflare Workers).
    const res = await fetch('https://api.sms.ir/v1/send/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        lineNumber: Number(lineNumber),
        MessageText: text,
        Mobiles: [mobile],
        SendDateTime: null,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      reportError(new Error(`sms.ir ${res.status}`), { scope: 'sms', kind });
      await log(mobile, kind, { text }, 'failed');
      return { ok: false };
    }
    // sms.ir returns { status, message, data } — status 1 means accepted.
    const body = (await res.json().catch(() => null)) as { status?: number } | null;
    const ok = !body || typeof body.status !== 'number' || body.status === 1;
    await log(mobile, kind, { text }, ok ? 'sent' : 'failed');
    if (!ok) reportError(new Error(`sms.ir status ${body!.status}`), { scope: 'sms', kind });
    return { ok };
  } catch (err) {
    reportError(err, { scope: 'sms', kind });
    await log(mobile, kind, { text }, 'failed');
    return { ok: false };
  }
}
