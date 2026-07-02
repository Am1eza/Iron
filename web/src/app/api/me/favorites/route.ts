import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { favoritesForUser, addFavorite } from '@/lib/server/repos/favoritesRepo';

/** GET /api/me/favorites — starred SKUs as PriceRows. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const favorites = await favoritesForUser(auth.session.id);
  return NextResponse.json({ favorites }, { headers: { 'Cache-Control': 'no-store' } });
}

const payload = z.object({ skuId: z.string().min(1) });

/** POST /api/me/favorites — star a SKU (id or slug). */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const ok = await addFavorite(auth.session.id, v.data.skuId);
  if (!ok) {
    return NextResponse.json({ error: 'not_found', message: 'محصول یافت نشد.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
