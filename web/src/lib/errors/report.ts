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
    name: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    status: (error as { status?: number } | null)?.status,
    context: redact(context),
    at: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.error('[poladin:error]', payload);
  // TODO: server → monitoring sink; client → navigator.sendBeacon('/api/log', JSON.stringify(payload)).
}
