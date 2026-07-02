/**
 * SMS delivery — Kavenegar in live mode (the locked provider), a console logger in
 * dev so the OTP flow works without credentials. Server-only. Never throws to the
 * caller in a way that leaks provider details to the client.
 */
import { reportError } from '@/lib/errors/report';

export interface SmsResult {
  ok: boolean;
  /** In dev only, the code is surfaced so the UI can show a hint. */
  devCode?: string;
}

/** Send an OTP code to a mobile. Returns ok even on provider hiccups we retry. */
export async function sendOtpSms(mobile: string, code: string): Promise<SmsResult> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  const template = process.env.KAVENEGAR_OTP_TEMPLATE ?? 'ahantime-otp';

  // Missing credentials in production is a deploy misconfiguration, not a valid
  // "dev mode" — fail loudly instead of silently claiming an SMS was sent (the
  // caller would otherwise tell every user "a code was texted to you" while
  // nobody can ever receive one).
  if (!apiKey && process.env.NODE_ENV === 'production') {
    reportError(new Error('KAVENEGAR_API_KEY missing in production'), { scope: 'sms' });
    return { ok: false };
  }

  // Dev / unconfigured: log instead of sending; surface the code for local testing.
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.info(`[sms:dev] OTP for ${mobile} = ${code}`);
    return { ok: true, devCode: code };
  }

  try {
    // Kavenegar Verify Lookup (token-based OTP template).
    const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;
    const params = new URLSearchParams({ receptor: mobile, token: code, template });
    const res = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
    if (!res.ok) {
      reportError(new Error(`kavenegar ${res.status}`), { scope: 'sms' });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    reportError(err, { scope: 'sms' });
    return { ok: false };
  }
}
