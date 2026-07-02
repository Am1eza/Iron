import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findAlert, updateAlertStatus, deleteAlert, toAlertDto, type AlertRow } from '@/lib/server/repos/alertsRepo';

async function owned(req: NextRequest, id: string): Promise<{ response: NextResponse } | { alert: AlertRow }> {
  const auth = await requireApiUser(req);
  if ('response' in auth) return { response: auth.response };
  const alert = await findAlert(id);
  if (!alert || alert.userId !== auth.session.id) {
    return {
      response: NextResponse.json({ error: 'not_found', message: 'هشدار یافت نشد.' }, { status: 404 }),
    };
  }
  return { alert };
}

const patchPayload = z.object({ status: z.enum(['active', 'paused']) });

/** PATCH /api/me/alerts/{id} — pause / re-arm. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { id } = await ctx.params;
  const o = await owned(req, id);
  if ('response' in o) return o.response;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;
  const updated = await updateAlertStatus(id, v.data.status);
  return NextResponse.json({ alert: updated ? toAlertDto(updated) : null });
}

/** DELETE /api/me/alerts/{id}. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { id } = await ctx.params;
  const o = await owned(req, id);
  if ('response' in o) return o.response;
  await deleteAlert(id);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
