import type { NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListLeads } from '@/lib/server/repos/leadsRepo';
import { csvResponse } from '@/lib/server/utils/csv';
import { parseLeadListFilters } from '../filters';

const HEADERS = ['ref', 'contactName', 'contactMobile', 'source', 'status', 'assigneeId', 'createdAt'] as const;
/** Same order-of-magnitude cap as the audit export — an unbounded CSV on a
 *  table that only grows is its own DoS risk. */
const EXPORT_MAX_ROWS = 5000;

/** GET /api/admin/leads/export — same filters as GET /api/admin/leads
 *  (status/assignee/q/from/to), capped, returned as a CSV download. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  const { leads } = await adminListLeads({
    ...parseLeadListFilters(req.nextUrl.searchParams),
    page: 1,
    perPage: EXPORT_MAX_ROWS,
  });
  const rows = leads.map((l) => [
    l.ref,
    l.contactName,
    l.contactMobile,
    l.source,
    l.status,
    l.assigneeId,
    l.createdAt.toISOString(),
  ]);
  return csvResponse('ahantime-leads.csv', HEADERS, rows);
}

export const GET = withApiErrorHandling(GETImpl);
