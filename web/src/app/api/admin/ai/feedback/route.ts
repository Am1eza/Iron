import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listAiFeedback, aiFeedbackSummary } from '@/lib/server/repos/aiReviewRepo';

/** GET /api/admin/ai/feedback?rating=&cursor= — keyset-paginated, newest first,
 *  plus a summary (up/down/last-7-day-down counts) for the review page tiles. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;

  const p = req.nextUrl.searchParams;
  const rating = p.get('rating');
  const [page, summary] = await Promise.all([
    listAiFeedback({
      rating: rating === 'up' || rating === 'down' ? rating : undefined,
      cursor: p.get('cursor') ?? undefined,
    }),
    aiFeedbackSummary(),
  ]);
  return NextResponse.json({ ...page, summary }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
