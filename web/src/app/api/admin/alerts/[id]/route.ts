import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findAlert, updateAlertStatus } from '@/lib/server/repos/alertsRepo';

const patchPayload = z.object({ status: z.enum(['active', 'paused']) });

/** PATCH /api/admin/alerts/{id} — pause/reactivate an alert on a user's behalf
 *  (e.g. a stale/abusive alert flagged by support). Never 'triggered' from
 *  here — that transition only happens from the evaluation job. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;

  const existing = await findAlert(id);
  if (!existing) return NextResponse.json({ error: 'not_found', message: 'هشدار یافت نشد.' }, { status: 404 });

  const alert = await updateAlertStatus(id, v.data.status);
  await audit(auth.session.id, 'alert.status.update', { type: 'alert', id }, { status: existing.status }, v.data);
  return NextResponse.json({ alert });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
