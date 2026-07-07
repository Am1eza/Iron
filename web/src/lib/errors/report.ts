/**
 * Centralized error reporting. Server: structured log + Sentry (once
 * SENTRY_DSN is set — see lib/errors/sentry.ts, a no-op until then).
 * Client: console now, sendBeacon('/api/log') later. NEVER expose to the user; redact PII.
 */
import { sendToSentry } from './sentry';
import { scrubMobile } from './scrub';

// Covers both PII (mobile/name/address/...) and credential-shaped keys
// (token/secret/password/authorization/...) — a future call site passing
// something like `{ authorization: req.headers.get('authorization') }` must
// not reach logs/Sentry in the clear just because it isn't "personal" data.
const REDACT_KEYS = /mobile|phone|code|otp|name|address|token|secret|password|apikey|api_key|authorization|jwt|dsn|cookie/i;

function redact(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = REDACT_KEYS.test(k) ? '[redacted]' : scrubMobile(v);
  }
  return out;
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const scrubbedContext = redact(context);
  const payload = {
    level: 'error',
    tag: 'ahantime:error',
    name: error instanceof Error ? error.name : 'Unknown',
    message: scrubMobile(error instanceof Error ? error.message : String(error)),
    // The stack tail always repeats `Error: <message>` — scrub it too, or the
    // mobile the message field just redacted leaks in the same log line.
    stack: scrubMobile(error instanceof Error ? error.stack : undefined),
    status: (error as { status?: number } | null)?.status,
    context: scrubbedContext,
    at: new Date().toISOString(),
  };
  // One JSON object per line (not util.inspect's multi-line pretty-print of
  // the raw object) — Docker's json-file driver and any real log aggregator
  // (Loki, CloudWatch, ...) can parse/query this without a custom sink; the
  // sink below is for alerting on top of these logs, not for making them
  // structured in the first place.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
  // Pass the SCRUBBED message/stack to Sentry too — it builds its event value
  // from these, and the raw error object would otherwise re-leak the mobile.
  sendToSentry(payload.name, payload.message, payload.stack, scrubbedContext);
  // TODO: client-side alerting — navigator.sendBeacon('/api/log', JSON.stringify(payload)).
}
