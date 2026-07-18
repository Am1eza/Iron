import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { promptVersionMetrics } from '@/lib/server/repos/aiUsageRepo';

/** GET /api/admin/ai/prompt-versions/metrics — per-version A/B comparison
 *  (US-05.5 AC2): feedback rate, token usage, cache-hit ratio. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  return NextResponse.json(
    { metrics: await promptVersionMetrics() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
