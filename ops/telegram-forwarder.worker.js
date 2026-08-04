/**
 * Telegram forwarder — a Cloudflare Worker that exists for exactly one reason.
 *
 * api.telegram.org is blocked at the Iranian national level, so the production
 * server CANNOT deliver alerts to Telegram directly. Measured on the box:
 *
 *   getent hosts api.telegram.org   -> 10.10.34.36   (the filtering address)
 *   curl https://api.telegram.org/  -> HTTP 000 after 10s
 *   curl https://api.github.com/    -> 200           (so: not a network fault)
 *
 * Cloudflare Workers ARE reachable from the server (verified: 200), and they
 * run outside Iran. This Worker is therefore a deliberately tiny, deliberately
 * boring hop: it accepts the exact Telegram Bot API request the app already
 * builds and replays it from Cloudflare's network.
 *
 * ---------------------------------------------------------------------------
 * DEPLOY (2 minutes, Cloudflare dashboard — no CLI, no repo access needed)
 *
 *  1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *     Name it `telegram-forwarder`. Deploy the placeholder, then "Edit code".
 *  2. Replace the entire editor contents with this file. Deploy.
 *  3. Worker -> Settings -> Variables and Secrets -> add ONE secret
 *     (use "Encrypt"/Secret, not a plain text variable):
 *        FORWARD_SECRET = <the same value as ALERT_RELAY_SECRET in .env>
 *  4. Copy the worker URL, e.g. https://telegram-forwarder.<you>.workers.dev
 *  5. Tell me the URL. I set TELEGRAM_API_BASE to it in .env and redeploy the
 *     app; nothing else changes.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS LOCKED DOWN THE WAY IT IS
 *
 * A naive forwarder is an open proxy: anyone who finds the URL can relay
 * arbitrary traffic through your Cloudflare account. So:
 *   - a shared secret is required, compared in constant time;
 *   - ONLY the sendMessage method is forwarded — not getUpdates, not
 *     setWebhook, not deleteMessage. A leaked bot token cannot be used through
 *     this hop to take over the bot;
 *   - POST only, JSON only, and the body is size-capped;
 *   - nothing is logged. The bot token transits this Worker in the URL path;
 *     logging the request URL would write a live credential into Cloudflare's
 *     log stream, so this Worker deliberately has no logging at all.
 */

const TELEGRAM = 'https://api.telegram.org';
const MAX_BODY_BYTES = 8192; // a Telegram message caps at 4096 chars
const ALLOWED_METHOD = 'sendMessage';

/** Constant-time string compare — a plain `===` on a secret leaks its prefix
 *  through timing to anyone who can measure it. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    // Fail CLOSED. An unset secret must never mean "allow everyone".
    if (!env.FORWARD_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: 'forwarder not configured' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const presented = url.searchParams.get('key') ?? request.headers.get('x-forward-secret') ?? '';
    if (!safeEqual(presented, env.FORWARD_SECRET)) {
      return new Response('forbidden', { status: 403 });
    }

    // Path must be exactly /bot<token>/sendMessage.
    const m = url.pathname.match(/^\/bot([^/]+)\/([A-Za-z]+)$/);
    if (!m) return new Response('bad path', { status: 400 });
    const [, token, method] = m;
    if (method !== ALLOWED_METHOD) {
      return new Response(`only ${ALLOWED_METHOD} is forwarded`, { status: 403 });
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return new Response('payload too large', { status: 413 });

    // Bound the upstream call: the caller is an alert path and must never hang.
    let upstream;
    try {
      upstream = await fetch(`${TELEGRAM}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Deliberately opaque: the exception message can contain the URL, and the
      // URL contains the bot token.
      return new Response(JSON.stringify({ ok: false, error: 'upstream unreachable' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Pass Telegram's own status and body straight back, so the app sees the
    // real API result (ok/description) and its existing error handling works
    // unchanged — this hop is transparent by design.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  },
};
