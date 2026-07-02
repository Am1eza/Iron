import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListLeads } from '@/lib/server/repos/leadsRepo';

/** GET /api/admin/leads?status=&assignee=&q=&page= — the CRM list. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const result = await adminListLeads({
    status: status && ['new', 'contacted', 'won', 'lost'].includes(status) ? (status as 'new') : undefined,
    assigneeId: p.get('assignee') ?? undefined,
    q: p.get('q') ?? undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
