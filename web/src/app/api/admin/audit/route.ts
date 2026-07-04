import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listAudit } from '@/lib/server/repos/auditRepo';

/** GET /api/admin/audit?entityType=&entityId=&actor=&cursor= — keyset-paginated,
 *  newest first; pass the previous response's `nextCursor` to page forward. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'audit:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await listAudit({
    entityType: p.get('entityType') ?? undefined,
    entityId: p.get('entityId') ?? undefined,
    actorId: p.get('actor') ?? undefined,
    cursor: p.get('cursor') ?? undefined,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
