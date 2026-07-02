import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { findCategoryBySlug, tableRows } from '@/lib/server/repos/catalogRepo';

/** GET /api/categories/{cat}/{sub} — the price table (Datasheet rows). */
export async function GET(_req: Request, ctx: { params: Promise<{ cat: string; sub: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { cat, sub } = await ctx.params;
  const category = await findCategoryBySlug(decodeURIComponent(cat));
  if (!category) {
    return NextResponse.json({ error: 'not_found', message: 'دسته یافت نشد.' }, { status: 404 });
  }
  const rows = await tableRows(category.slug, decodeURIComponent(sub));
  return NextResponse.json(
    { rows },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
