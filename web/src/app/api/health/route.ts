import { NextResponse } from 'next/server';
import { hasDb, getDb } from '@/lib/server/db/client';
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
 * "db: true/false".
 *
 * `region` echoes NEXT_PUBLIC_DEPLOY_REGION — the one thing this endpoint
 * adds beyond a plain liveness check — so a geo-routing setup (see
 * GEO-ROUTING.md) can be verified end-to-end: curl this from inside Iran and
 * from abroad and confirm each hit the origin you expect, before trusting it
 * with real traffic.
 */
export async function GET() {
  const region = publicEnv.NEXT_PUBLIC_DEPLOY_REGION;
  if (!hasDb()) {
    return NextResponse.json({ status: 'ok', db: 'not_configured', region });
  }
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: 'up', region });
  } catch {
    return NextResponse.json({ status: 'error', db: 'down', region }, { status: 503 });
  }
}
