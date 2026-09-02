import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { subCategoryImpact } from '@/lib/server/repos/catalogAdminRepo';

/**
 * What deleting this sub-category would actually destroy.
 *
 * The confirm dialog counted this in the browser, off `subCategory.skuCount`
 * in whatever page of the list was loaded. That number is a snapshot of the
 * moment the panel last fetched: anything filed under the sub-category since
 * — by another admin, by the price sync, by a script — was invisible to the
 * sentence the admin agreed to.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  return NextResponse.json(await subCategoryImpact(id), { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
