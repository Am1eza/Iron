import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { requestsForUser, insertRequest } from '@/lib/server/repos/requestsRepo';
import { nextRef } from '@/lib/server/utils/refs';

/** GET /api/me/requests — the account inbox («درخواست‌های من»).
 *  ?page= — 50/page; `hasMore` tells the client to keep paging (was a hard
 *  silent 200-row cap with no way past it). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const page = Math.max(Number(req.nextUrl.searchParams.get('page') ?? '1') || 1, 1);
  const { rows: requests, hasMore } = await requestsForUser(auth.session.id, page);
  return NextResponse.json({ requests, page, hasMore }, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  type: z.enum(['proforma', 'bulk', 'warehouse']),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** POST /api/me/requests — file a request (bulk/warehouse asks from the UI). */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;

  const prefix = v.data.type === 'warehouse' ? 'WH' : 'RQ';
  const ref = await nextRef(prefix);
  const request = await insertRequest({ userId: auth.session.id, ref, ...v.data });
  return NextResponse.json({ request }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
