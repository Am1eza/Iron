import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { searchSkus } from '@/lib/server/repos/catalogRepo';
import { searchArticles } from '@/lib/server/repos/articlesRepo';

/** GET /api/search?q= — products + articles (powers /search in live mode). */
async function GETImpl(req: NextRequest) {
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
