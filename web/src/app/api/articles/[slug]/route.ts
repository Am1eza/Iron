import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { findPublishedBySlug } from '@/lib/server/repos/articlesRepo';

/** GET /api/articles/{slug} — full body; 404 unless published. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  // Unauthenticated, one indexed DB read per call, and an unknown slug still
  // pays for the query — see the note in ../route.ts.
  const limited = await rateLimit(req, 'articles', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { slug } = await ctx.params;
  const article = await findPublishedBySlug(decodeURIComponent(slug));
  if (!article) {
    return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  }
  return NextResponse.json(
    { article },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
