import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb } from '@/lib/server/utils/apiGuard';
import { alertsForUser } from '@/lib/server/repos/alertsRepo';

/** GET /api/me/alerts — the user's alerts with display labels. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const alerts = await alertsForUser(auth.session.id);
  return NextResponse.json({ alerts }, { headers: { 'Cache-Control': 'no-store' } });
}
