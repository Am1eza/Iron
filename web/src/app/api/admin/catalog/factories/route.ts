import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { distinctFactories } from '@/lib/server/repos/catalogAdminRepo';

/** Factory names already in use — the SKU form offers these as a datalist so
 *  «ذوب آهن» doesn't quietly become three manufacturers in the public
 *  factory-comparison table. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ factories: await distinctFactories() }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
