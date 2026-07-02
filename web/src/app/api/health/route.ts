import { NextResponse } from 'next/server';
import { hasDb, getDb } from '@/lib/server/db/client';
import { sql } from 'drizzle-orm';

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
 */
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ status: 'ok', db: 'not_configured' });
  }
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: 'up' });
  } catch {
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503 });
  }
}
