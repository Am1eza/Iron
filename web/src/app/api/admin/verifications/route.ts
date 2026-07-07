import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listPendingVerifications } from '@/lib/server/repos/verificationRepo';

/** GET /api/admin/verifications — the pending KYC/KYB review queue. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ pending: await listPendingVerifications() });
}

export const GET = withApiErrorHandling(GETImpl);
