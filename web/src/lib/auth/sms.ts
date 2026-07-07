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
    // the URL are verified against the official `smsir-js` SDK's source
    // (github.com/IPeCompany/SmsPanelV2.nodejs) — its request body uses
    // PascalCase (Mobile/TemplateId/Parameters), not the camelCase this
    // handler previously sent. Kept on native `fetch` rather than adopting
    // that SDK directly: it hard-depends on axios, which does not work on
    // Cloudflare Workers (this app's other deployment target) — confirmed
    // via axios/axios#7383 and Cloudflare's own Node-compat docs; `fetch` is
    // the one HTTP client guaranteed to work identically on both targets.
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
        Parameters: [{ Name: 'Code', Value: code }],
      }),
      // Bound the external call — a slow/hung SMS.ir must not stall the login
      // request (the OTP is already stored, so failing fast lets the user retry).
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      reportError(new Error(`sms.ir ${res.status}`), { scope: 'sms' });
      return { ok: false };
    }
    // sms.ir returns { status, message, data } — status 1 means accepted.
    const body = (await res.json().catch(() => null)) as { status?: number } | null;
    if (body && typeof body.status === 'number' && body.status !== 1) {
      reportError(new Error(`sms.ir status ${body.status}`), { scope: 'sms' });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    reportError(err, { scope: 'sms' });
    return { ok: false };
  }
}
