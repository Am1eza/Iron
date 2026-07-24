/**
 * Kavenegar OTP provider — an optional, faster alternative to the SMS.ir
 * verify line for OTP delivery. Measured SMS.ir delivery to MCI (همراه اول)
 * numbers ran 90–210+ seconds even on the account's own service lines;
 * Kavenegar's verify/lookup auto-selects the best sender line per carrier
 * (and can fall back to a voice call), which is materially faster for OTP.
 *
 * Fully opt-in: only used when BOTH KAVENEGAR_API_KEY and
 * KAVENEGAR_OTP_TEMPLATE are set (see sendOtpSms). Server-only; never leaks
 * provider details to the client.
 *
 * API (kavenegar.com/rest.html):
 *   GET/POST https://api.kavenegar.com/v1/{key}/verify/lookup.json
 *     ?receptor=<mobile>&token=<code>&template=<panel-template-name>
 *   return.status 200 = accepted; 418 = no balance; 424 = template
 *   missing/not-approved; 426 = advanced service required.
 */
import { reportError } from '@/lib/errors/report';

export interface KavenegarResult {
  ok: boolean;
  /** Distinguishes "not set up" from "tried and failed" so the caller can
   *  fall through to the next provider instead of failing the whole send. */
  notConfigured?: boolean;
}

export function kavenegarConfigured(): boolean {
  return Boolean(process.env.KAVENEGAR_API_KEY && process.env.KAVENEGAR_OTP_TEMPLATE);
}

/** Send an OTP code via Kavenegar's verify/lookup. The token must contain no
 *  spaces — a numeric OTP always satisfies that. */
export async function sendOtpViaKavenegar(mobile: string, code: string): Promise<KavenegarResult> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  const template = process.env.KAVENEGAR_OTP_TEMPLATE;
  if (!apiKey || !template) return { ok: false, notConfigured: true };

  // The api-key sits in the PATH; keep it out of query logs. Params are
  // form-encoded in the POST body (not the URL) so the code never lands in
  // an access log's query string.
  const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`;
  const body = new URLSearchParams({ receptor: mobile, token: code, template });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      // Same bound as the SMS.ir path — a hung provider must not stall login.
      signal: AbortSignal.timeout(8000),
    });
    const parsed = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
    const status = parsed?.return?.status;
    if (res.ok && status === 200) return { ok: true };
    // Surface the provider's own status so a misconfigured template (424) or
    // empty balance (418) is diagnosable from the error log.
    reportError(new Error(`kavenegar status ${status ?? res.status}`), { scope: 'sms', provider: 'kavenegar' });
    return { ok: false };
  } catch (err) {
    reportError(err, { scope: 'sms', provider: 'kavenegar' });
    return { ok: false };
  }
}
