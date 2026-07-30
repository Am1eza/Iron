import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateRequestStatus } from '@/lib/server/repos/requestsRepo';
import { REQUEST_STATUSES } from '@/lib/server/db/schema';

// W20: 'fulfilled' added for warehouse requests (never reach 'quoted' — no
// پیش‌فاکتور involved). Enumerated from the schema's own REQUEST_STATUSES
// instead of a hand-copied literal list, so this route can't silently drift
// out of sync with it again the way it did when 'fulfilled' was first added.
const payload = z.object({ status: z.enum(REQUEST_STATUSES) });

/** PATCH /api/admin/requests/{id} — advance the request status trail. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const request = await updateRequestStatus(id, v.data.status);
  if (!request) return NextResponse.json({ error: 'not_found', message: 'درخواست یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'request.status', { type: 'userRequest', id }, null, v.data);
  return NextResponse.json({ request });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
