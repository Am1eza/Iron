import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listProformas, expireDueProformas } from '@/lib/server/repos/leadsRepo';

/** GET /api/admin/proformas?status=&page= — the proforma register. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;

  const p = req.nextUrl.searchParams;
  const rawStatus = p.get('status');
  const status = rawStatus === 'active' || rawStatus === 'expired' || rawStatus === 'cancelled' ? rawStatus : undefined;
  // Register correctness: sweep lazily so «فعال» never shows an already-due
  // proforma between job runs (same guarantee findProformaByRef gives reads).
  await expireDueProformas().catch(() => {});
  const result = await listProformas({
    status,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result);
}

export const GET = withApiErrorHandling(GETImpl);
