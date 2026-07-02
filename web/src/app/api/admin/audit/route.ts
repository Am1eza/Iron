import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb } from '@/lib/server/utils/apiGuard';
import { listAudit } from '@/lib/server/repos/auditRepo';

/** GET /api/admin/audit?entityType=&entityId=&actor=&page=. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'audit:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await listAudit({
    entityType: p.get('entityType') ?? undefined,
    entityId: p.get('entityId') ?? undefined,
    actorId: p.get('actor') ?? undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
