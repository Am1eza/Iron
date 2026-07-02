import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { listCategories } from '@/lib/server/repos/catalogRepo';

/** GET /api/categories — active categories, ordered (client caches 5 min). */
export async function GET() {
  const guard = requireDb();
  if (guard) return guard;
  const categories = await listCategories();
  return NextResponse.json(
    { categories },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
