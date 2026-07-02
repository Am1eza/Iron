/**
 * Lightweight per-IP rate limiter for public POST endpoints (leads, contact,
 * cooperation, track lookups). In-process sliding window — sufficient for the
 * single-container deployment; swap for a shared store if web scales out
 * (OTP limits are already DB-backed separately).
 */
import { NextResponse, type NextRequest } from 'next/server';

const windows = new Map<string, number[]>();
let lastSweep = Date.now();

/**
 * Client IP for rate-limit bucketing — trusts exactly ONE hop (Caddy in
 * front, per Caddyfile/docker-compose.yml: `web` is `expose`-only, never
 * `ports`-published, so it is only reachable through Caddy's reverse_proxy).
 *
 * SECURITY: Caddy's `reverse_proxy` APPENDS the real peer IP to any
 * client-supplied `X-Forwarded-For` rather than replacing it — so
 * `X-Forwarded-For: 1.2.3.4, <real-ip>` may arrive with an attacker-chosen
 * first value. Taking the LEFTMOST entry (as many naive implementations do)
 * lets any client spoof their rate-limit bucket. We take the RIGHTMOST
 * entry instead — the one Caddy itself appended — which is not
 * attacker-controlled under this single-trusted-proxy topology. If this app
 * is ever deployed WITHOUT Caddy in front (e.g. bare `next start` reachable
 * directly, or a second proxy hop added), this header is fully spoofable —
 * `TRUST_PROXY=false` disables per-IP granularity in that case rather than
 * silently trusting attacker input.
 */
function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'false') return 'untrusted-proxy';
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return req.headers.get('x-real-ip') ?? 'local';
}

/** Returns a 429 response when over the limit, else null. */
export function rateLimit(
  req: NextRequest,
  scope: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): NextResponse | null {
  const now = Date.now();
  // Periodic sweep so the map never grows unbounded.
  if (now - lastSweep > 5 * 60_000) {
    lastSweep = now;
    for (const [key, hits] of windows) {
      const alive = hits.filter((t) => now - t < 10 * 60_000);
      if (alive.length === 0) windows.delete(key);
      else windows.set(key, alive);
    }
  }
  const key = `${scope}:${clientIp(req)}`;
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'درخواست‌ها بیش از حد است. کمی بعد دوباره تلاش کنید.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) } },
    );
  }
  hits.push(now);
  windows.set(key, hits);
  return null;
}
