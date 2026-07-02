/**
 * Centralized error reporting. Server: structured log (→ monitoring later).
 * Client: console now, sendBeacon('/api/log') later. NEVER expose to the user; redact PII.
 */
const PII_KEYS = /mobile|phone|code|otp|name|address/i;

function redact(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = PII_KEYS.test(k) ? '[redacted]' : v;
  }
  return out;
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    level: 'error',
    tag: 'ahantime:error',
    name: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    status: (error as { status?: number } | null)?.status,
    context: redact(context),
    at: new Date().toISOString(),
  };
  // One JSON object per line (not util.inspect's multi-line pretty-print of
  // the raw object) — Docker's json-file driver and any real log aggregator
  // (Loki, CloudWatch, ...) can parse/query this without a custom sink; the
  // sink below is for alerting on top of these logs, not for making them
  // structured in the first place.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
  // TODO: proactive alerting sink (Sentry via instrumentation.onRequestError,
  // or a webhook) — logs are structured and captured today; nothing pages
  // anyone yet. client → navigator.sendBeacon('/api/log', JSON.stringify(payload)).
}
