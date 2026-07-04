import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { searchSkus } from '@/lib/server/repos/catalogRepo';
import { searchArticles } from '@/lib/server/repos/articlesRepo';

/** GET /api/search?q= — products + articles (powers /search in live mode).
 *  The only unauthenticated GET endpoint that hits the DB on every call, so
 *  (unlike other read routes) it gets its own rate limit — public, no
 *  origin check applies to GET, and a 2-char query is cheap to hammer. */
async function GETImpl(req: NextRequest) {
  const limited = await rateLimit(req, 'search', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ skus: [], articles: [] });
  const [skus, articles] = await Promise.all([searchSkus(q), searchArticles(q)]);
  return NextResponse.json(
    { skus, articles },
    { headers: { 'Cache-Control': 'public, s-maxage=60' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
