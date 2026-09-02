/**
 * Centralized error reporting, isomorphic by design.
 *  - Server: structured JSON log line + Sentry (lib/errors/sentry.ts, a no-op
 *    until SENTRY_DSN is set). That module is loaded ONLY on the server, via a
 *    dynamic import inside a `typeof window` branch — see sendToSentry's call
 *    site for why a static import was wrong.
 *  - Client: the same log line, plus a sendBeacon hop to /api/log so browser
 *    failures reach the same tracker.
 * NEVER expose any of this to the user; redact PII first.
 */
import { scrubPii } from './scrub';

// Covers both PII (mobile/name/address/nationalId/email/...) and
// credential-shaped keys (token/secret/password/authorization/...) — a future
// call site passing something like `{ authorization: req.headers.get('authorization') }`
// must not reach logs/Sentry in the clear just because it isn't "personal" data.
// nationalId/melliCode: no safe value-level pattern exists for this app (a bare
// 10-digit regex collides with Toman prices — see scrub.ts) so it's redacted
// key-name-only, same as mobile/otp.
const REDACT_KEYS = /mobile|phone|code|otp|name|address|token|secret|password|apikey|api_key|authorization|jwt|dsn|cookie|email|nationalid|melli/i;

/** How deep to walk before giving up. Error context here is shallow by
 *  convention; this only bounds a pathological or accidentally huge object. */
const MAX_REDACT_DEPTH = 6;

/** Recursively redact by key name and scrub by value.
 *
 *  This used to walk one level only: `scrubPii(v)` returns objects and arrays
 *  untouched, so a REDACT_KEYS key nested even one level down — the very
 *  common `{ user: { mobile } }` or `{ payload: { otp } }` — reached both the
 *  log line and Sentry in the clear. Only top-level keys were ever protected. */
function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_REDACT_DEPTH) return '[truncated]';
  if (value === null || typeof value !== 'object') return scrubPii(value);
  // A cycle would otherwise recurse forever inside a logging path, turning an
  // error report into a hang.
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? '[redacted]' : redactValue(v, depth + 1, seen);
  }
  return out;
}

function redact(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return redactValue(context, 0, new WeakSet()) as Record<string, unknown>;
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
  level: 'error' | 'warning' = 'error',
): void {
  const scrubbedContext = redact(context);
  const payload = {
    level,
    tag: 'ahantime:error',
    name: error instanceof Error ? error.name : 'Unknown',
    message: scrubPii(error instanceof Error ? error.message : String(error)),
    // The stack tail always repeats `Error: <message>` — scrub it too, or the
    // mobile/email the message field just redacted leaks in the same log line.
    stack: scrubPii(error instanceof Error ? error.stack : undefined),
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
  console[level === 'warning' ? 'warn' : 'error'](JSON.stringify(payload));
  // Pass the SCRUBBED message/stack to Sentry too — it builds its event value
  // from these, and the raw error object would otherwise re-leak the mobile.
  //
  // SERVER ONLY, and imported dynamically inside this branch on purpose.
  // `./sentry` is a server module — it reads the non-public SENTRY_DSN and
  // posts straight to the ingestion endpoint — but a plain top-level import
  // put it in the CLIENT bundle: `grep -rl sentry_key .next/static/chunks`
  // found the envelope builder in six chunks, including app/layout. There it
  // was pure dead weight (Next replaces a non-NEXT_PUBLIC_ env with undefined,
  // so `ingestUrl()` always returned null and every call was a no-op) and a
  // standing invitation for a later change to make the DSN public "so client
  // errors work too". Next's bundler substitutes `typeof window` per target,
  // so this branch — and the import inside it — is eliminated from the client
  // build entirely. Client-side errors take the /api/log hop below instead,
  // which is what that endpoint exists for.
  if (typeof window === 'undefined') {
    void import('./sentry')
      .then((m) =>
        m.sendToSentry(payload.name, payload.message, payload.stack, scrubbedContext, level),
      )
      .catch(() => {});
  }
  beaconToServer(payload);
}

/** In the browser, hand the already-scrubbed report to /api/log so client-side
 *  failures reach the same error tracker as server ones. sendBeacon survives
 *  the page being torn down, which is exactly when the interesting errors
 *  happen; `keepalive` fetch is the fallback for browsers without it.
 *  Everything here is best-effort and must never throw — this runs on a page
 *  that is already failing, and a reporting error would replace the real one. */
function beaconToServer(payload: {
  name: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}): void {
  if (typeof window === 'undefined') return;
  // The server already reported it directly; only the client half needs the hop.
  if (payload.context?.source === 'client') return;
  try {
    const body = JSON.stringify({
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
      url: window.location?.href,
      userAgent: navigator.userAgent,
    });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/log', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/log', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // no-op
  }
}
