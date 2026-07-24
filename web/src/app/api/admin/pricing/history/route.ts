import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { skuHistoryBatch } from '@/lib/server/repos/catalogRepo';

/** POST /api/admin/pricing/history — { slugs: string[], range? } → one
 *  response with every row's 30-day series. Replaces the pricing grid's
 *  N-requests-per-page sparkline pattern (POST because a 60-slug list
 *  overflows a comfortable query string). Capped defensively. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as { slugs?: unknown; range?: unknown } | null;
  const slugs = Array.isArray(body?.slugs)
    ? body.slugs.filter((s): s is string => typeof s === 'string').slice(0, 300)
    : [];
  const range = typeof body?.range === 'string' ? body.range : '30d';
  const series = await skuHistoryBatch(slugs, range);
  return NextResponse.json({ series });
}

export const POST = withApiErrorHandling(POSTImpl);
