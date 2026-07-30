import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { settlementsForUser } from '@/lib/server/repos/warehouseSettlementsRepo';

/** GET /api/me/warehouse/settlements — the signed-in customer's OWN
 *  consignment-fee billing history (W20). Previously the only settlement
 *  data a customer could reach at all was the once-off bulk /api/me/export;
 *  «انبار من» itself showed a current fee with no way to see what had
 *  actually been charged, ever. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const settlements = await settlementsForUser(auth.session.id);
  return NextResponse.json({ settlements }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
