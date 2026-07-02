import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb } from '@/lib/server/utils/apiGuard';
import { removeFavorite } from '@/lib/server/repos/favoritesRepo';

/** DELETE /api/me/favorites/{skuId} — unstar. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ skuId: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const { skuId } = await ctx.params;
  await removeFavorite(auth.session.id, decodeURIComponent(skuId));
  return NextResponse.json({ ok: true });
}
