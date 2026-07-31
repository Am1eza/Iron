import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listPendingVerifications } from '@/lib/server/repos/verificationRepo';

/** GET /api/admin/verifications?page=&perPage= — the pending KYC/KYB review
 *  queue. `total` counts REVIEW ITEMS, not users (one user with both a
 *  personal and a business submission pending is two items) — it is what the
 *  queue badge shows, so it must never be the page length. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await listPendingVerifications(
    Math.max(1, Number(p.get('page') ?? 1) || 1),
    p.get('perPage') ? Math.max(1, Number(p.get('perPage')) || 30) : undefined,
  );
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
