import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import {
  findAlert,
  updateAlertStatus,
  reactivateAlert,
  deleteAlert,
  toAlertDto,
  alertCapForTier,
  AlertCapExceededError,
  type AlertRow,
} from '@/lib/server/repos/alertsRepo';
import type { AuthUser } from '@/lib/auth/types';

async function owned(req: NextRequest, id: string): Promise<{ response: NextResponse } | { alert: AlertRow; session: AuthUser }> {
  const auth = await requireApiUser(req);
  if ('response' in auth) return { response: auth.response };
  const alert = await findAlert(id);
  if (!alert || alert.userId !== auth.session.id) {
    return {
      response: NextResponse.json({ error: 'not_found', message: 'هشدار یافت نشد.' }, { status: 404 }),
    };
  }
  return { alert, session: auth.session };
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

  // W22 review fix: re-arming a paused/triggered alert is exactly as
  // cap-relevant as creating one — pause N alerts, create N more, re-arm
  // the paused ones, and the old code let a user blow straight past their
  // cap since only POST /api/alerts ever checked it. `reactivateAlert`
  // enforces the cap ATOMICALLY (a per-user advisory lock spans the
  // count-check and the update) — a plain read-then-write let concurrent
  // requests race past the cap, the same class of bug this whole check was
  // meant to close in the first place. Only the active-going transition is
  // cap-relevant; a pause (or a no-op) goes through the plain update below.
  if (v.data.status === 'active' && o.alert.status !== 'active') {
    const cap = await alertCapForTier(o.session.clubTier);
    let updated: AlertRow | null;
    try {
      updated = await reactivateAlert(id, o.session.id, cap);
    } catch (err) {
      if (err instanceof AlertCapExceededError) {
        return NextResponse.json({ error: 'limit', message: err.message, cap: err.cap }, { status: 409 });
      }
      throw err;
    }
    await audit(o.session.id, 'alert.status.update', { type: 'alert', id }, { status: o.alert.status }, v.data);
    return NextResponse.json({ alert: updated ? toAlertDto(updated) : null });
  }

  const updated = await updateAlertStatus(id, v.data.status);
  await audit(o.session.id, 'alert.status.update', { type: 'alert', id }, { status: o.alert.status }, v.data);
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
  await audit(o.session.id, 'alert.delete', { type: 'alert', id }, { status: o.alert.status }, null);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
