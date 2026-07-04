/**
 * Per-IP rate limiter for public endpoints (leads, contact, cooperation,
 * OTP, AI chat, search, track lookups). Two layers, combined:
 *
 * 1. Cloudflare's native Rate Limiting binding (`env.RL_<SCOPE>`, configured
 *    in wrangler.jsonc's `ratelimits`) — cross-isolate counters shared by
 *    `namespace_id`, so this is the AUTHORITATIVE check on the Workers
 *    deploy. Only supports a fixed 60s window (Cloudflare's cap), so scopes
 *    whose business rule is a longer window (ai-chat, otp-verify,
 *    otp-request) get a binding sized to a fraction of their real limit —
 *    a durable, cross-isolate backstop against a burst distributed across
 *    isolates/PoPs, not a full substitute for the longer window.
 * 2. An in-process sliding window (the original implementation) — correct
 *    and sufficient on its own for the single-container Docker/Node deploy,
 *    and still the one that enforces the FULL 5-minute rule for ai-chat/
 *    otp-verify/otp-request on Workers, layered under the 60s binding above.
 *    Those three routes also have their own DB-backed controls beneath all
 *    of this (OTP attempt-lock/resend-cooldown in lib/auth/service.ts;
 *    ai-chat's one-lead-per-conversation cap) — defense in depth, not the
 *    sole guard.
 *
 * Why both layers instead of just the binding: the binding is intentionally
 * "eventually consistent, not an accurate accounting system" per Cloudflare's
 * own docs, and isn't available at all outside Workers — see
 * https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const windows = new Map<string, number[]>();
let lastSweep = Date.now();

/** Maps a `rateLimit()` scope to its wrangler.jsonc binding name. The
 *  >60s-window scopes (ai-chat, otp-verify, otp-request) are included too —
 *  their binding enforces a scaled-down 60s ceiling as a durable backstop,
 *  while the in-process check below still enforces their full window. */
const BINDING_BY_SCOPE: Record<string, string> = {
  track: 'RL_TRACK',
  contact: 'RL_CONTACT',
  leads: 'RL_LEADS',
  tools: 'RL_TOOLS',
  proforma: 'RL_PROFORMA',
  cooperation: 'RL_COOPERATION',
  search: 'RL_SEARCH',
  'ai-chat': 'RL_AI_CHAT',
  'otp-verify': 'RL_OTP_VERIFY',
  'otp-request': 'RL_OTP_REQUEST',
};

/** `true`/`false` from the binding, or `null` when unavailable (not on
 *  Workers, or no binding configured for this scope) — `null` means "defer
 *  to the in-process check only". */
async function nativeLimited(scope: string, key: string): Promise<boolean | null> {
  const bindingName = BINDING_BY_SCOPE[scope];
  if (!bindingName) return null;
  try {
    const { env } = getCloudflareContext();
    const binding = (
      env as unknown as Record<string, { limit?: (o: { key: string }) => Promise<{ success: boolean }> }>
    )[bindingName];
    if (!binding?.limit) return null;
    const { success } = await binding.limit({ key });
    return !success;
  } catch {
    return null; // not running on Workers (e.g. Node/Docker) — no Cloudflare context
  }
}

/**
 * Client IP for rate-limit bucketing. Two supported deployment topologies,
 * each with exactly ONE trusted hop in front of this app:
 *
 * 1. Cloudflare Workers — `CF-Connecting-IP` is set by Cloudflare's edge
 *    itself, before the Worker ever runs, and cannot be reached except
 *    through that edge (Workers are not independently internet-routable).
 *    Not spoofable under this topology. This MUST be checked first:
 *    Cloudflare's own docs confirm `X-Forwarded-For` is only appended by
 *    the backend proxy *after* a Worker has already run, so it is simply
 *    ABSENT during Worker execution — every request here used to silently
 *    fall through to the `'local'` literal below, collapsing every visitor
 *    into a single shared rate-limit bucket sitewide (found via a live
 *    production check, not a hypothetical).
 * 2. Docker/Caddy — per Caddyfile/docker-compose.yml: `web` is
 *    `expose`-only, never `ports`-published, so it is only reachable
 *    through Caddy's `reverse_proxy`.
 *
 * SECURITY (Docker/Caddy path): Caddy's `reverse_proxy` APPENDS the real
 * peer IP to any client-supplied `X-Forwarded-For` rather than replacing
 * it — so `X-Forwarded-For: 1.2.3.4, <real-ip>` may arrive with an
 * attacker-chosen first value. Taking the LEFTMOST entry (as many naive
 * implementations do) lets any client spoof their rate-limit bucket. We
 * take the RIGHTMOST entry instead — the one Caddy itself appended — which
 * is not attacker-controlled under this single-trusted-proxy topology.
 *
 * If this app is ever deployed behind neither of these (e.g. bare
 * `next start` reachable directly, or an added proxy hop), both headers
 * are fully spoofable — `TRUST_PROXY=false` disables per-IP granularity in
 * that case rather than silently trusting attacker input.
 */
function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'false') return 'untrusted-proxy';
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return req.headers.get('x-real-ip') ?? 'local';
}

function limitedResponse(windowMs: number): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited', message: 'درخواست‌ها بیش از حد است. کمی بعد دوباره تلاش کنید.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) } },
  );
}

/** Returns a 429 response when over the limit, else null. */
export async function rateLimit(
  req: NextRequest,
  scope: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): Promise<NextResponse | null> {
  const ip = clientIp(req);
  const key = `${scope}:${ip}`;

  const native = await nativeLimited(scope, key);
  if (native === true) return limitedResponse(windowMs);

  const now = Date.now();
  // Periodic sweep so the map never grows unbounded.
  if (now - lastSweep > 5 * 60_000) {
    lastSweep = now;
    for (const [k, hits] of windows) {
      const alive = hits.filter((t) => now - t < 10 * 60_000);
      if (alive.length === 0) windows.delete(k);
      else windows.set(k, alive);
    }
  }
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    return limitedResponse(windowMs);
  }
  hits.push(now);
  windows.set(key, hits);
  return null;
}
