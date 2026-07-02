/**
 * Kavenegar SMS — the locked provider. Template (verify/lookup) and raw sends,
 * with the dev fallback (no API key → console + sms_log 'dev_logged') so every
 * flow works before credentials arrive. Deliveries are recorded in sms_log.
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

/** Kavenegar verify/lookup — token-based template send (OTP, proforma ref). */
export async function sendTemplateSms(
  mobile: string,
  template: string,
  tokens: { token: string; token2?: string; token3?: string },
  kind: SmsKind = 'generic',
): Promise<{ ok: boolean }> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  if (!apiKey) {
    console.info(`[sms:dev] ${kind} → ${mobile} (${template}):`, tokens);
    await log(mobile, kind, { template, ...tokens }, 'dev_logged');
    return { ok: true };
  }
  try {
    const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;
    const params = new URLSearchParams({ receptor: mobile, template, token: tokens.token });
    if (tokens.token2) params.set('token2', tokens.token2);
    if (tokens.token3) params.set('token3', tokens.token3);
    const res = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
    const ok = res.ok;
    await log(mobile, kind, { template, ...tokens }, ok ? 'sent' : 'failed');
    if (!ok) reportError(new Error(`kavenegar ${res.status}`), { scope: 'sms', template });
    return { ok };
  } catch (err) {
    reportError(err, { scope: 'sms', template });
    await log(mobile, kind, { template, ...tokens }, 'failed');
    return { ok: false };
  }
}

/** Plain-text SMS (alerts, ad-hoc notifies). */
export async function sendRawSms(mobile: string, text: string, kind: SmsKind = 'generic'): Promise<{ ok: boolean }> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  const sender = process.env.KAVENEGAR_SENDER;
  if (!apiKey) {
    console.info(`[sms:dev] ${kind} → ${mobile}: ${text}`);
    await log(mobile, kind, { text }, 'dev_logged');
    return { ok: true };
  }
  try {
    const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`;
    const params = new URLSearchParams({ receptor: mobile, message: text });
    if (sender) params.set('sender', sender);
    const res = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
    const ok = res.ok;
    await log(mobile, kind, { text }, ok ? 'sent' : 'failed');
    if (!ok) reportError(new Error(`kavenegar ${res.status}`), { scope: 'sms' });
    return { ok };
  } catch (err) {
    reportError(err, { scope: 'sms' });
    await log(mobile, kind, { text }, 'failed');
    return { ok: false };
  }
}
