import { NextResponse } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findCategoryBySlug, tableRows } from '@/lib/server/repos/catalogRepo';
import { jsonWithEtag } from '@/lib/server/utils/httpCache';

/** GET /api/categories/{cat}/{sub} — the price table (Datasheet rows). */
async function GETImpl(req: Request, ctx: { params: Promise<{ cat: string; sub: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { cat, sub } = await ctx.params;
  const category = await findCategoryBySlug(decodeURIComponent(cat));
  if (!category) {
    return NextResponse.json({ error: 'not_found', message: 'دسته یافت نشد.' }, { status: 404 });
  }
  const rows = await tableRows(category.slug, decodeURIComponent(sub));
  // See utils/httpCache.ts — validator instead of an un-invalidatable
  // stale-while-revalidate window, so a corrected price cannot outlive the
  // ISR pages that already refresh correctly.
  return jsonWithEtag(req, { rows }, 120);
}

export const GET = withApiErrorHandling(GETImpl);
