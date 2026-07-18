import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListLeads } from '@/lib/server/repos/leadsRepo';
import { parseLeadListFilters } from './filters';

/** GET /api/admin/leads?status=&assignee=&q=&from=&to=&page=&perPage= — the CRM list. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await adminListLeads({
    ...parseLeadListFilters(p),
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
    perPage: p.get('perPage') ? Math.max(1, Number(p.get('perPage')) || 30) : undefined,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
