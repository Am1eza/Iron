import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { findSkuRow, relatedSkuRows } from '@/lib/server/repos/catalogRepo';

/** GET /api/sku/{slug} — one SKU row + related rows for cross-sell. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { slug } = await ctx.params;
  const row = await findSkuRow(decodeURIComponent(slug));
  if (!row) {
    return NextResponse.json({ error: 'not_found', message: 'محصول یافت نشد.' }, { status: 404 });
  }
  const related = await relatedSkuRows(row.slug);
  return NextResponse.json(
    { sku: row, related },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
