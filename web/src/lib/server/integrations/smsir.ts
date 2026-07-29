/**
 * SMS.ir sending — the locked provider (see AUTH.md). Two APIs, two very
 * different reliability profiles:
 *
 *  - `sendTemplate` — the Verify/template API. Rides SMS.ir's own service-
 *    line pool automatically (no lineNumber, and SMS.ir's own docs name
 *    "اطلاع‌رسانی وضعیت سفارشات" — order-status notifications — as an
 *    intended use, not just OTP codes). This is why OTP kept working
 *    through the 2026-07 line-number outage while everything below did not:
 *    OTP was already on this path.
 *  - `sendSms` — free-text bulk send on `SMSIR_LINE_NUMBER`. Content- and
 *    line-type-sensitive (a wrong/advertising line 400s or silently never
 *    arrives) and the only option for genuinely unstructured text (a staff
 *    member's typed reply) that can't be pre-approved as a template.
 *
 * `sendNotification` is the seam between the two: pass a template env var
 * name + params, and it uses the template if the owner has registered and
 * configured one, falling back to the equivalent free-text send otherwise —
 * so every notification below upgrades to the template path the moment its
 * SMSIR_TEMPLATE_ID_* is set, with zero code change and no risk of a message
 * silently stopping if the env var is ever unset again.
 */
import { ulid } from 'ulid';
import { reportError } from '@/lib/errors/report';
import { scrubPii } from '@/lib/errors/scrub';
import { getDb, hasDb } from '@/lib/server/db/client';
import { smsLog } from '@/lib/server/db/schema';
import { withResilience } from '@/lib/server/utils/resilience';

class SmsHttpError extends Error {
  constructor(
    public status: number,
    /** SMS.ir's own explanation of the rejection, already scrubbed+truncated. */
    public providerMessage?: string,
  ) {
    super(providerMessage ? `sms.ir ${status}: ${providerMessage}` : `sms.ir ${status}`);
    this.name = 'SmsHttpError';
  }
}

/** Bound what a provider error page can push into logs/sms_log — SMS.ir
 *  answers some rejections with an HTML page, not the JSON envelope. */
const PROVIDER_MESSAGE_MAX = 300;

/**
 * Read WHY SMS.ir rejected the send. This body used to be thrown away (the
 * error was just `sms.ir 400`), which is what made the 2026-07 outage — a
 * wrong SMSIR_LINE_NUMBER, so every free-text send 400'd while OTP kept
 * working on the template endpoint — take hours to diagnose: the answer
 * ("line number is not valid") was in the response body all along.
 * Scrubbed because SMS.ir echoes the recipient mobile in some messages; the
 * request's `x-api-key` never appears in a response body and is never logged.
 */
async function readProviderMessage(res: Response): Promise<string | undefined> {
  try {
    if (typeof res.text !== 'function') return undefined;
    const raw = await res.text();
    if (!raw) return undefined;
    let msg = raw;
    try {
      const parsed = JSON.parse(raw) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message.trim()) msg = parsed.message;
    } catch {
      /* not the JSON envelope (HTML/plain error page) — keep the raw text */
    }
    return scrubPii(msg.replace(/\s+/g, ' ').trim()).slice(0, PROVIDER_MESSAGE_MAX);
  } catch {
    return undefined; // body already consumed / connection died — status alone still reports
  }
}

export type SmsKind = 'otp' | 'proforma' | 'alert' | 'generic';

export interface SmsSendResult {
  ok: boolean;
  /**
   * The send was REJECTED, not merely unlucky: a 4xx that isn't 429 (bad line
   * number, unapproved text, invalid key) or missing credentials in
   * production. Re-sending the identical message on a timer will fail
   * identically until a human changes config or content — schedulers must
   * stop retrying instead of piling up failed rows (one bad proforma logged
   * dozens on the 30-min tick during the outage).
   */
  permanent?: boolean;
}

/** A 429 is a rate limit (retry later); every other 4xx is a rejection that
 *  will reproduce forever with the same request. 5xx/timeouts/circuit-open
 *  are transient by definition and stay retryable. */
function isPermanentRejection(err: unknown): boolean {
  return err instanceof SmsHttpError && err.status >= 400 && err.status < 500 && err.status !== 429;
}

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
export async function sendSms(mobile: string, text: string, kind: SmsKind = 'generic'): Promise<SmsSendResult> {
  const apiKey = process.env.SMSIR_API_KEY;
  const lineNumber = process.env.SMSIR_LINE_NUMBER;
  if (!apiKey || !lineNumber) {
    const missing = [!apiKey && 'SMSIR_API_KEY', !lineNumber && 'SMSIR_LINE_NUMBER'].filter(Boolean).join(' و ');
    // Missing credentials in production is a deploy misconfiguration, not a
    // valid "dev mode" — same fail-closed rule as sendOtpSms. Returning
    // {ok:true} here used to make callers tell the sales rep «پیامک شد» while
    // no message could ever leave the box: the exact shape of the outage where
    // a wrong line number killed every free-text send unnoticed for days.
    if (isProd()) {
      reportError(new Error(`SMS.ir free-text send unconfigured in production: ${missing} missing`), { scope: 'sms', kind });
      await log(mobile, kind, { text, error: `unconfigured: ${missing}` }, 'failed');
      return { ok: false, permanent: true };
    }
    // PII (mobile + message content) — never echoed to prod stdout, only the
    // DB-backed sms_log (which is access-controlled via the admin panel).
    console.info(`[sms:dev] ${kind} → ${mobile}: ${text}`);
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
    // Unlike tgju (background-only poll), sendSms is awaited synchronously
    // on user-facing request paths (proforma issuance, alert crossings) —
    // so the retry budget here is deliberately smaller (1 retry, 200ms base)
    // to bound the added latency, vs tgju's 2 retries/300ms in a background job.
    const res = await withResilience(
      'smsir',
      async () => {
        const r = await fetch('https://api.sms.ir/v1/send/bulk', {
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
        // Read the body BEFORE throwing: SMS.ir puts the actual reason
        // (invalid line number, unapproved text, ...) in it, and a Response
        // whose body is never consumed carries that reason to the grave.
        if (!r.ok) throw new SmsHttpError(r.status, await readProviderMessage(r));
        return r;
      },
      {
        retries: 1,
        baseDelayMs: 200,
        // 429 added (US-otp-fix): this endpoint gets called back-to-back with
        // the Verify send during the delivery-watchdog fallback (see sms.ts),
        // which is exactly the kind of burst a rate limit reacts to — a 429
        // used to fail immediately with no retry at all.
        isRetryable: (err) => err instanceof SmsHttpError && (err.status >= 500 || err.status === 429),
      },
    );
    // sms.ir returns { status, message, data } — status 1 means accepted.
    // A response body that isn't parseable JSON is NOT treated as success —
    // it used to be (the `!body ||` branch), which meant a malformed/empty
    // response from sms.ir was silently logged and reported as a successful
    // send with no visibility into the real outcome.
    const body = (await res.json().catch(() => null)) as { status?: number; message?: string } | null;
    const ok = typeof body?.status === 'number' && body.status === 1;
    if (ok) {
      await log(mobile, kind, { text }, 'sent');
      return { ok: true };
    }
    // Carry the envelope's own `message` too — a 200 with status≠1 is the
    // other way SMS.ir says no, and the reason is equally worth keeping.
    const reason = body
      ? `sms.ir status ${body.status}${body.message ? `: ${scrubPii(String(body.message)).slice(0, PROVIDER_MESSAGE_MAX)}` : ''}`
      : 'sms.ir bulk: unparseable response body';
    await log(mobile, kind, { text, error: reason }, 'failed');
    reportError(new Error(reason), { scope: 'sms', kind });
    // NOT marked permanent: an application-level rejection can be transient
    // (credit exhausted, then topped up), unlike a 4xx on the request itself.
    return { ok: false };
  } catch (err) {
    reportError(err, { scope: 'sms', kind });
    const permanent = isPermanentRejection(err);
    await log(
      mobile,
      kind,
      // The provider's explanation lands in sms_log too, so «چرا نرفت؟» is
      // answerable from the admin DB without correlating container logs.
      { text, error: err instanceof Error ? scrubPii(err.message) : 'unknown', ...(permanent ? { permanent: true } : {}) },
      'failed',
    );
    return permanent ? { ok: false, permanent: true } : { ok: false };
  }
}

/* --------------------------- templated (Verify) --------------------------- */

export interface TemplateParam {
  /** Must equal the placeholder text between the # signs in the registered
   *  panel template EXACTLY — see auth/sms.ts's OTP template for the same
   *  contract. A mismatched name delivers the literal "#NAME#" to the user. */
  name: string;
  value: string;
}

/** SMS.ir caps a Verify template parameter's VALUE at 25 characters — long
 *  refs/amounts/labels are truncated defensively instead of failing the
 *  send. `…` is 1 char, so the cut is at max-1. */
export function truncateParam(value: string, max = 25): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Templated send via SMS.ir's Verify API (POST /v1/send/verify/) — the same
 * endpoint OTP uses (auth/sms.ts), generalized to any registered template.
 * No lineNumber: SMS.ir routes these on its own service-line pool.
 */
export async function sendTemplate(
  mobile: string,
  templateId: string,
  params: TemplateParam[],
  kind: SmsKind,
): Promise<SmsSendResult> {
  const apiKey = process.env.SMSIR_API_KEY;
  if (!apiKey) {
    if (isProd()) {
      reportError(new Error('SMS.ir template send unconfigured in production: SMSIR_API_KEY missing'), {
        scope: 'sms',
        kind,
      });
      await log(mobile, kind, { templateId, params, error: 'unconfigured: SMSIR_API_KEY' }, 'failed');
      return { ok: false, permanent: true };
    }
    console.info(`[sms:dev] ${kind} template ${templateId} → ${mobile}: ${JSON.stringify(params)}`);
    await log(mobile, kind, { templateId, params }, 'dev_logged');
    return { ok: true };
  }
  try {
    const res = await withResilience(
      'smsir-verify',
      async () => {
        const r = await fetch('https://api.sms.ir/v1/send/verify/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({
            Mobile: mobile,
            TemplateId: Number(templateId),
            Parameters: params.map((p) => ({ name: p.name, value: p.value })),
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!r.ok) throw new SmsHttpError(r.status, await readProviderMessage(r));
        return r;
      },
      {
        retries: 1,
        baseDelayMs: 200,
        isRetryable: (err) => err instanceof SmsHttpError && (err.status >= 500 || err.status === 429),
      },
    );
    const body = (await res.json().catch(() => null)) as { status?: number; message?: string } | null;
    const ok = typeof body?.status === 'number' && body.status === 1;
    if (ok) {
      await log(mobile, kind, { templateId, params }, 'sent');
      return { ok: true };
    }
    const reason = body
      ? `sms.ir status ${body.status}${body.message ? `: ${scrubPii(String(body.message)).slice(0, PROVIDER_MESSAGE_MAX)}` : ''}`
      : 'sms.ir verify: unparseable response body';
    await log(mobile, kind, { templateId, params, error: reason }, 'failed');
    reportError(new Error(reason), { scope: 'sms', kind });
    return { ok: false };
  } catch (err) {
    reportError(err, { scope: 'sms', kind });
    const permanent = isPermanentRejection(err);
    await log(
      mobile,
      kind,
      { templateId, params, error: err instanceof Error ? scrubPii(err.message) : 'unknown', ...(permanent ? { permanent: true } : {}) },
      'failed',
    );
    return permanent ? { ok: false, permanent: true } : { ok: false };
  }
}

export interface NotificationSpec {
  /** Name of the env var holding this notification's SMS.ir template id
   *  (e.g. 'SMSIR_TEMPLATE_ID_PROFORMA_ISSUED'). Unset → fallbackText ships
   *  on the bulk line instead, exactly like today. */
  templateEnvVar: string;
  params: TemplateParam[];
  fallbackText: string;
  kind: SmsKind;
}

/**
 * The seam every customer-facing notification should call through instead of
 * `sendSms` directly: templated the moment the owner registers + configures
 * a template, free-text bulk send until then. Nothing regresses either way.
 */
export async function sendNotification(mobile: string, spec: NotificationSpec): Promise<SmsSendResult> {
  const templateId = process.env[spec.templateEnvVar];
  if (templateId) return sendTemplate(mobile, templateId, spec.params, spec.kind);
  return sendSms(mobile, spec.fallbackText, spec.kind);
}
