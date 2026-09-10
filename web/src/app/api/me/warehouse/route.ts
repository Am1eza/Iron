import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { warehouseItemsPageForUser } from '@/lib/server/repos/ordersRepo';

/** GET /api/me/warehouse — the user's consigned stock («انبار من»), paged
 *  (E-116) the same way /api/me/warehouse/settlements already is: `page`
 *  query param, `hasMore` in the response. `?page` omitted defaults to the
 *  first (and for almost every customer, only) page — existing callers that
 *  never sent `page` keep working unchanged. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get('page')) || 1));
  const result = await warehouseItemsPageForUser(auth.session.id, page);
  const items = result.rows;
  return NextResponse.json(
    { items, page, hasMore: page * result.perPage < result.total },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
