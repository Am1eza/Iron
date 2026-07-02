import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { warehouseForUser } from '@/lib/server/repos/ordersRepo';

/** GET /api/me/warehouse — the user's consigned stock («انبار من»). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const items = await warehouseForUser(auth.session.id);
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
