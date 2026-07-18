import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { ordersForUser } from '@/lib/server/repos/ordersRepo';

/** GET /api/me/orders — the signed-in user's shipments.
 *  ?page= — 50/page; `hasMore` tells the client to keep paging (was a hard
 *  silent 100-row cap with no way past it). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const page = Math.max(Number(req.nextUrl.searchParams.get('page') ?? '1') || 1, 1);
  const { rows: orders, hasMore } = await ordersForUser(auth.session.id, page);
  return NextResponse.json({ orders, page, hasMore }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
