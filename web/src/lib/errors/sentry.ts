/**
 * Minimal Sentry reporting — a hand-rolled envelope POST instead of the
 * `@sentry/nextjs` SDK. Deliberate, not an oversight: that SDK's server
 * instrumentation is a documented major contributor to bundle size on
 * Cloudflare Workers (docs.sentry.io/platforms/javascript/guides/cloudflare/),
 * and this app's own Workers upload is already ~2.3 MB gzipped against the
 * free plan's 3 MB cap (`wrangler deploy --dry-run` at the time of writing).
 * It also needs `compatibility_date >= 2025-08-16` for `https.request`,
 * which this repo's `wrangler.jsonc` doesn't set. Posting straight to
 * Sentry's plain HTTP envelope ingestion endpoint needs no dependency, no
 * compat-date bump, and works identically on Node (Docker) and Workers via
 * plain `fetch` — it covers the actual need (server-side capture-and-alert)
 * without that risk.
 *
 * Upgrade path if you later want tracing/session replay/source-mapped
 * stack traces in the Sentry UI: swap this for `@sentry/nextjs`, but
 * re-check Workers bundle headroom and bump `compatibility_date` first.
 *
 * No-ops entirely until `SENTRY_DSN` is set (server-only env var — see
 * `.env.example`) — zero behavior change for anyone who hasn't configured
 * it. Client-side (browser) error capture isn't wired here: `reportError`
 * runs isomorphically, but there's no `NEXT_PUBLIC_SENTRY_DSN` path yet
 * (would want to relay through `/api/log` rather than expose ingestion
 * details to the browser directly) — out of scope for this pass.
 */

let cachedIngestUrl: string | null | undefined;

function ingestUrl(): string | null {
  if (cachedIngestUrl !== undefined) return cachedIngestUrl;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    cachedIngestUrl = null;
    return null;
  }
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    cachedIngestUrl = `${u.protocol}//${u.host}/api/${projectId}/envelope/?sentry_key=${u.username}&sentry_version=7`;
  } catch {
    cachedIngestUrl = null;
  }
  return cachedIngestUrl;
}

/**
 * Report a pre-SCRUBBED error to Sentry. Callers (report.ts) pass the already
 * PII-scrubbed name/message/stack/context — this never sees the raw error, so a
 * mobile in the message or stack can't leak into ingestion.
 */
export function sendToSentry(
  name: string,
  message: string,
  stack: string | undefined,
  context?: Record<string, unknown>,
): void {
  const url = ingestUrl();
  if (!url) return;

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    level: 'error',
    environment: process.env.NODE_ENV ?? 'production',
    server_name: 'ahantime',
    exception: {
      values: [
        {
          type: name,
          // Stack included as the message tail rather than parsed into Sentry's
          // structured frame format — correct grouping/alerting without a
          // fragile hand-rolled parser. Already scrubbed by the caller.
          value: stack ? `${message}\n\n${stack}` : message,
        },
      ],
    },
    extra: context,
  };
  const envelope =
    `${JSON.stringify({ event_id: eventId, sent_at: sentAt })}\n` +
    `${JSON.stringify({ type: 'event' })}\n` +
    `${JSON.stringify(event)}\n`;

  // Fire-and-forget — alerting must never become a request-blocking dependency.
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body: envelope,
  }).catch(() => {});
}
