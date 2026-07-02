import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { removeFavorite } from '@/lib/server/repos/favoritesRepo';

/** DELETE /api/me/favorites/{skuId} — unstar. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ skuId: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const { skuId } = await ctx.params;
  await removeFavorite(auth.session.id, decodeURIComponent(skuId));
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiErrorHandling(DELETEImpl);
