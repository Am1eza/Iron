import { NextResponse } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findCategoryBySlug, listSubCategories, tableRows } from '@/lib/server/repos/catalogRepo';
import { jsonWithEtag } from '@/lib/server/utils/httpCache';

/** GET /api/categories/{cat} — category + subs + the full price table. */
async function GETImpl(req: Request, ctx: { params: Promise<{ cat: string }> }) {
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
  // Admin price saves invalidate the ISR pages but cannot invalidate a cache
  // this origin does not own — so the API is made VALIDATABLE instead of
  // advertising a 300s stale-serving window nothing can cut short. See
  // utils/httpCache.ts.
  return jsonWithEtag(req, { category, subs, rows }, 120);
}

export const GET = withApiErrorHandling(GETImpl);
