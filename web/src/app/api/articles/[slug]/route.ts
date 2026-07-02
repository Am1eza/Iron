import { NextResponse } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findPublishedBySlug } from '@/lib/server/repos/articlesRepo';

/** GET /api/articles/{slug} — full body; 404 unless published. */
async function GETImpl(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
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
