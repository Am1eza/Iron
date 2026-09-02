import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { categoryImpact } from '@/lib/server/repos/catalogAdminRepo';

/**
 * What deleting this category would actually destroy — its sub-categories,
 * every product filed under them, and their whole price history.
 *
 * This is the largest blast radius the panel offers, and the only one the
 * dialog described entirely from client-side counts: a category rendered as
 * «۰ کالا» could still take hundreds of products with it if anything had been
 * filed under it since the page loaded.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  return NextResponse.json(await categoryImpact(id), { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
