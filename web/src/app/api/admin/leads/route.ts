import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListLeads } from '@/lib/server/repos/leadsRepo';
import { parseLeadListFilters } from './filters';

/** GET /api/admin/leads?status=&assignee=&q=&from=&to=&page=&perPage=&sort= — the CRM list.
 *  `sort` defaults to 'urgency' HERE (not inside adminListLeads, whose own
 *  default stays 'newest') — this is the one interactive surface a rep
 *  triages from; the CSV export and everything else keep plain newest-first
 *  unless they explicitly ask otherwise. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const sort = p.get('sort') === 'newest' ? 'newest' : 'urgency';
  const result = await adminListLeads({
    ...parseLeadListFilters(p),
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
    perPage: p.get('perPage') ? Math.max(1, Number(p.get('perPage')) || 30) : undefined,
    sort,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
