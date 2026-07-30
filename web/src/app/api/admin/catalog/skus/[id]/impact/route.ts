import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { skuImpact } from '@/lib/server/repos/catalogAdminRepo';

/**
 * What retiring this product would actually disturb. The confirm dialog used
 * to promise nothing and name nothing; hiding a SKU that sits in three open
 * deals is a different decision from hiding one nobody has asked about, and
 * the admin could not tell the two apart.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  return NextResponse.json(await skuImpact(id), { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
