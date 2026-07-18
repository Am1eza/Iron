import type { NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listAuditForExport } from '@/lib/server/repos/auditRepo';
import { csvResponse } from '@/lib/server/utils/csv';
import { parseAuditFilters } from '../filters';

const HEADERS = ['at', 'action', 'entityType', 'entityId', 'actorName', 'actorMobile', 'actorId'] as const;

/** GET /api/admin/audit/export — same filters as GET /api/admin/audit
 *  (entityType/entityId/actor/action/from/to), capped at
 *  listAuditForExport's row limit, streamed back as a CSV download. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'audit:read');
  if ('response' in auth) return auth.response;

  const entries = await listAuditForExport(parseAuditFilters(req.nextUrl.searchParams));
  const rows = entries.map((e) => [
    e.at.toISOString(),
    e.action,
    e.entityType,
    e.entityId,
    e.actorName,
    e.actorMobile,
    e.actorId,
  ]);
  return csvResponse('ahantime-audit.csv', HEADERS, rows);
}

export const GET = withApiErrorHandling(GETImpl);
