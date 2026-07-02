import { NextResponse, type NextRequest } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { listPublished } from '@/lib/server/repos/articlesRepo';

/** GET /api/articles?type=blog|news&page= — published articles. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const type = req.nextUrl.searchParams.get('type') === 'news' ? 'news' : 'blog';
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1) || 1);
  const result = await listPublished(type, page);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
