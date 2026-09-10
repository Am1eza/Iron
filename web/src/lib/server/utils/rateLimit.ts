/**
 * Per-IP rate limiter for public endpoints (leads, contact, cooperation,
 * OTP, AI chat, search, track lookups). Layers, combined, checked in order:
 *
 * 1. Cloudflare's native Rate Limiting binding (`env.RL_<SCOPE>`, configured
 *    in wrangler.jsonc's `ratelimits`) — cross-isolate counters shared by
 *    `namespace_id`, so this is the AUTHORITATIVE check on the Workers
 *    deploy. Only supports a fixed 60s window (Cloudflare's cap), so scopes
 *    whose business rule is a longer window (ai-chat, otp-verify,
 *    otp-request) get a binding sized to match their full 5-minute limit
 *    (not a fraction of it) — a durable, cross-isolate backstop against a
 *    burst distributed across isolates/PoPs, without throttling a single
 *    legitimate 60s burst below what the app already allows over 5 minutes.
 * 2. Redis (`redisRateCheck`) — AUTHORITATIVE on the Docker/Node deploy,
 *    shared across restarts and replicas.
 * 3. F-131: when Redis returns `null` (unreachable/unconfigured), the
 *    auth-critical scopes in `DB_FALLBACK_SCOPES` fall back to an atomic
 *    Postgres upsert (`dbRateCheck`) instead of jumping straight to the
 *    per-process window below — see dbRateLimit.ts's doc comment. This is
 *    what keeps the OTP-send quota GLOBAL during a Redis outage in a
 *    multi-worker/multi-replica deploy; without it, an outage silently
 *    fragments one shared quota into N independent per-worker quotas at
 *    exactly the moment abuse is more likely.
 * 4. An in-process sliding window (the original implementation, and the last
 *    resort for every OTHER scope during a Redis outage) — correct and
 *    sufficient on its own for the single-container Docker/Node deploy as it
 *    stands today, and still the one that enforces the FULL 5-minute rule for
 *    ai-chat/otp-verify/otp-request on Workers, layered under the 60s binding
 *    above. otp-verify/otp-request also have their own DB-backed controls
 *    beneath all of this (OTP attempt-lock/resend-cooldown in
 *    lib/auth/service.ts; ai-chat has its own one-lead-per-conversation cap)
 *    — defense in depth, not the sole guard.
 *
 * Why not just the binding: the binding is intentionally "eventually
 * consistent, not an accurate accounting system" per Cloudflare's own docs,
 * and isn't available at all outside Workers — see
 * https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { redisRateCheck } from '@/lib/server/redis';
import { dbRateCheck } from '@/lib/server/utils/dbRateLimit';

/**
 * F-131 — scopes whose quota must stay GLOBAL even when Redis is unreachable,
 * because a fragmented per-worker fallback there is a security regression
 * (paid SMS.ir sends, brute-force budget), not just a UX/cost nicety. Kept
 * short and explicit rather than "every scope" on purpose: routing every
 * public request (search, leads, contact — much higher QPS) through a
 * synchronous Postgres upsert during a Redis outage would trade one incident
 * for a second one (extra write load on the database at the exact moment it
 * may already be stressed), for scopes where the existing per-worker window
 * is a tolerable, not a security-critical, degradation. See
 * docs/audit-auth-F.md's F-131 closure note for the full reasoning and the
 * probe that proves the combined quota stays bounded across two workers.
 */
const DB_FALLBACK_SCOPES = new Set(['otp-request', 'otp-verify']);

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
  tender: 'RL_TENDER',
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
/** `true` only when actually executing on Cloudflare Workers. Same probe as
 *  `nativeLimited` above: `getCloudflareContext()` throws outside a Worker. */
function onCloudflareWorkers(): boolean {
  try {
    return Boolean(getCloudflareContext()?.env);
  } catch {
    return false;
  }
}

export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'false') return 'untrusted-proxy';
  // `CF-Connecting-IP` is only unspoofable on topology 1, where Cloudflare's
  // own edge sets it before the Worker runs. On topology 2 (Docker/Caddy) the
  // Caddyfile has no `header_up -CF-Connecting-IP`, so a client-supplied value
  // arrives verbatim — trusting it there handed any caller a fresh rate-limit
  // bucket per request just by varying one header, which nullified every
  // per-IP limit including the ones metering paid SMS.ir sends and DeepSeek
  // calls. Gate it on the runtime rather than reading it unconditionally.
  const cfIp = onCloudflareWorkers() ? req.headers.get('cf-connecting-ip') : null;
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
  // e2e drives many logins (across specs, plus toPass retries for
  // hydration races — see e2e/auth.spec.ts) through this same loopback IP
  // within minutes, well past otp-request's 8-per-5-min production cap —
  // unlike the per-mobile/DB-backed OTP controls, that's not something the
  // suite is meant to exercise. Only playwright.config.ts's webServer sets
  // this; never set it outside e2e. The NODE_ENV guard makes that an
  // enforced invariant rather than a convention held up by this comment —
  // the flag short-circuits EVERY scope including otp-request, so leaking it
  // into a production env file would uncap SMS.ir sends billed to the owner.
  // Playwright's webServer does not run with NODE_ENV=production, so e2e is
  // unaffected.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.DISABLE_RATE_LIMIT_FOR_TESTS === 'true'
  ) {
    return null;
  }

  const ip = clientIp(req);
  const key = `${scope}:${ip}`;

  const native = await nativeLimited(scope, key);
  if (native === true) return limitedResponse(windowMs);

  // Redis layer — AUTHORITATIVE on the Docker/Node deploy (shared across
  // restarts and replicas, unlike the in-process window below). Returns null
  // when Redis isn't configured/available, in which case we fall through to
  // the in-process window as before.
  const viaRedis = await redisRateCheck(key, limit, windowMs);
  if (viaRedis === true) return limitedResponse(windowMs);
  if (viaRedis === false) return null;

  // Redis is unreachable (viaRedis === null). For the scopes above, an
  // atomic Postgres upsert keeps the quota GLOBAL across every worker/replica
  // instead of silently fragmenting into one independent quota per process —
  // see dbRateLimit.ts and F-131 in docs/audit-auth-F.md.
  if (DB_FALLBACK_SCOPES.has(scope)) {
    const viaDb = await dbRateCheck(key, limit, windowMs);
    if (viaDb === true) return limitedResponse(windowMs);
    if (viaDb === false) return null;
  }

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
