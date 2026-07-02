import { NextResponse } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findCategoryBySlug, listSubCategories, tableRows } from '@/lib/server/repos/catalogRepo';

/** GET /api/categories/{cat} — category + subs + the full price table. */
async function GETImpl(_req: Request, ctx: { params: Promise<{ cat: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { cat } = await ctx.params;
  const category = await findCategoryBySlug(decodeURIComponent(cat));
  if (!category) {
    return NextResponse.json({ error: 'not_found', message: 'دسته یافت نشد.' }, { status: 404 });
  }
  const [subs, rows] = await Promise.all([
    listSubCategories(category.slug),
    tableRows(category.slug),
  ]);
  return NextResponse.json(
    { category, subs, rows },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
