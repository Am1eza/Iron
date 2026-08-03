import { NextResponse } from 'next/server';
import { hasDb, getDb } from '@/lib/server/db/client';
import { redisHealth } from '@/lib/server/redis';
import { sql } from 'drizzle-orm';
import { publicEnv } from '@/lib/validation/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — container/orchestrator liveness+readiness check.
 * In mock mode (no DATABASE_URL) the app is healthy by definition (nothing
 * to reach); in live mode it round-trips a trivial query so a Postgres
 * outage is reflected here, not just discovered on the next user request.
 * Deliberately unauthenticated + no rate limit — this is the same trust
 * tier as a container healthcheck, called frequently and only ever leaks
 * coarse up/down flags for the DB and cache.
 *
 * `region` echoes NEXT_PUBLIC_DEPLOY_REGION — the one thing this endpoint
 * adds beyond a plain liveness check — so a geo-routing setup (see
 * GEO-ROUTING.md) can be verified end-to-end: curl this from inside Iran and
 * from abroad and confirm each hit the origin you expect, before trusting it
 * with real traffic.
 */
export async function GET() {
  const region = publicEnv.NEXT_PUBLIC_DEPLOY_REGION;
  // Reported but NEVER fatal — see redisHealth(). A cache outage degrades
  // rate limiting to a per-process window, which is worth surfacing, but the
  // app is designed to keep serving through it and a 503 here would have an
  // orchestrator kill a container that is working fine.
  const redis = await redisHealth();
  if (!hasDb()) {
    return NextResponse.json({ status: 'ok', db: 'not_configured', redis, region });
  }
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: 'up', redis, region });
  } catch {
    return NextResponse.json({ status: 'error', db: 'down', redis, region }, { status: 503 });
  }
}
