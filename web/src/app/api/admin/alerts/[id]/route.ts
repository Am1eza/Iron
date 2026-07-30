import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { clubMemberships } from '@/lib/server/db/schema';
import { findAlert, updateAlertStatus, reactivateAlert, alertCapForTier, AlertCapExceededError } from '@/lib/server/repos/alertsRepo';

const patchPayload = z.object({ status: z.enum(['active', 'paused']) });

/** PATCH /api/admin/alerts/{id} — pause/reactivate an alert on a user's
 *  behalf (e.g. a stale/abusive alert flagged by support, or re-arming a
 *  'triggered' one a customer called in about — W22 added the button for
 *  that state; the API itself never restricted the source status). */
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

  // W22: reactivating on a customer's behalf is exactly as cap-relevant as
  // the customer doing it themselves (see /api/me/alerts/[id]/route.ts) —
  // an admin bypassing the tier cap here would leave the SAME inconsistent
  // state that fix closed for the customer-facing path. `reactivateAlert`
  // enforces it ATOMICALLY under the TARGET user's lock (not the acting
  // admin's) — a plain read-then-write would let two concurrent admin
  // reactivations (or an admin racing the customer's own request) both pass
  // a stale count and both commit past the cap.
  if (v.data.status === 'active' && existing.status !== 'active') {
    const membership = await getDb()
      .select({ tier: clubMemberships.tier })
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, existing.userId))
      .limit(1);
    const cap = await alertCapForTier(membership[0]?.tier);
    let updated;
    try {
      updated = await reactivateAlert(id, existing.userId, cap);
    } catch (err) {
      if (err instanceof AlertCapExceededError) {
        return NextResponse.json({ error: 'limit', message: `این کاربر به سقف ${cap} هشدار فعال رسیده است.`, cap }, { status: 409 });
      }
      throw err;
    }
    await audit(auth.session.id, 'alert.status.update', { type: 'alert', id }, { status: existing.status }, v.data);
    return NextResponse.json({ alert: updated });
  }

  const alert = await updateAlertStatus(id, v.data.status);
  await audit(auth.session.id, 'alert.status.update', { type: 'alert', id }, { status: existing.status }, v.data);
  return NextResponse.json({ alert });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
