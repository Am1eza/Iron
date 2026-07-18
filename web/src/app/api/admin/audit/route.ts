import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listAudit } from '@/lib/server/repos/auditRepo';
import { parseAuditFilters } from './filters';

/** GET /api/admin/audit?entityType=&entityId=&actor=&action=&from=&to=&cursor=
 *  — keyset-paginated, newest first; pass the previous response's
 *  `nextCursor` to page forward. Entries carry `actorName`/`actorMobile`
 *  alongside the raw `actorId` (was raw-id-only before US-23.2). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'audit:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await listAudit({ ...parseAuditFilters(p), cursor: p.get('cursor') ?? undefined });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
