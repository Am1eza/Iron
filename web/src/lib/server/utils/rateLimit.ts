/**
 * Lightweight per-IP rate limiter for public POST endpoints (leads, contact,
 * cooperation, track lookups). In-process sliding window — sufficient for the
 * single-container deployment; swap for a shared store if web scales out
 * (OTP limits are already DB-backed separately).
 */
import { NextResponse, type NextRequest } from 'next/server';

const windows = new Map<string, number[]>();
let lastSweep = Date.now();

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'
  );
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
