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
  level: 'error' | 'warning' = 'error',
): void {
  const url = ingestUrl();
  if (!url) return;

  // Guard the METHOD, not the container. `crypto` exists on every target;
  // `randomUUID` needs Safari 15.4+/Chrome 92+ AND a secure context. This runs
  // inside the client error boundary, so a missing method threw *inside* the
  // handler for an error — React cannot recover from that, and the user got a
  // blank screen instead of the Persian retry page. Same class of mistake as
  // the navigator.connection bug removed in 2ce7c10.
  const eventId = (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`
  ).replace(/-/g, '');
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    level,
    environment: process.env.NODE_ENV ?? 'production',
    // Without a release, every event in the tracker is undated in the only
    // sense that matters: you cannot tell whether an error is still happening
    // on what is deployed now or was fixed three deploys ago, and "regressed
    // in this release" alerting is impossible. APP_RELEASE is the image tag
    // (the git sha the deploy pipeline builds from); 'unknown' when unset, so
    // this stays a no-op in dev rather than inventing a version.
    release: process.env.APP_RELEASE ?? 'unknown',
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
