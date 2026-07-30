import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { catalogSuggestions } from '@/lib/server/repos/catalogAdminRepo';

/**
 * Values already in use for the free-text SKU columns, scoped to a category
 * when one is given. Feeds the product form's pickers so the admin chooses
 * rather than types — which is both faster and the only way «ذوب آهن» stays
 * one factory instead of three spellings in the public comparison table.
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const categoryId = req.nextUrl.searchParams.get('categoryId') ?? undefined;
  return NextResponse.json(await catalogSuggestions(categoryId), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const GET = withApiErrorHandling(GETImpl);
