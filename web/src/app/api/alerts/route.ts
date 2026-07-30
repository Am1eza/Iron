import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { createAlert, alertCapForTier, AlertTargetNotFoundError, AlertCapExceededError } from '@/lib/server/repos/alertsRepo';
import { finiteNumber } from '@/lib/validation/utils';

const alertPayload = z.object({
  target: z.union([
    z.object({ type: z.literal('sku'), skuId: z.string().min(1).max(120) }),
    z.object({ type: z.literal('market'), key: z.enum(['usd', 'eur', 'gold18', 'ounce', 'billet']) }),
  ]),
  op: z.enum(['below', 'above']),
  // Money-like threshold — same finite+ceiling guard as bigint price fields.
  threshold: z.coerce.number().pipe(finiteNumber.positive().max(1e13)),
  channel: z.enum(['sms', 'telegram', 'whatsapp', 'eitaa']).default('sms'),
});

/** POST /api/alerts — create a price alert (قیمت‌سنج). Auth required.
 *  Merges into an identical active alert (VR-C1) instead of duplicating it. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const limited = await rateLimit(req, 'alerts-create', { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const v = await validateBody(req, alertPayload);
  if (!v.ok) return v.response;

  // W22: per-TIER cap (owner's explicit call — 2 for a regular/iron user,
  // more for steel/poolad club members), not the old flat 20-for-everyone
  // setting. `clubTier` comes straight off the session (already left-joined
  // on every request, see auth/types.ts) — no extra query. Enforced ATOMICALLY
  // inside createAlert (a per-user advisory lock spans the count-check and
  // the insert) — a plain read-then-write here would let concurrent requests
  // for different targets all pass the same stale count and all commit,
  // exceeding the cap (the exact review finding this closes).
  const cap = await alertCapForTier(auth.session.clubTier);
  let created: Awaited<ReturnType<typeof createAlert>>;
  try {
    created = await createAlert({ userId: auth.session.id, ...v.data, cap });
  } catch (err) {
    if (err instanceof AlertTargetNotFoundError) {
      return NextResponse.json({ error: 'target_not_found', message: err.message }, { status: 400 });
    }
    if (err instanceof AlertCapExceededError) {
      return NextResponse.json({ error: 'limit', message: err.message, cap: err.cap }, { status: 409 });
    }
    throw err;
  }
  await audit(auth.session.id, 'alert.create', { type: 'alert', id: created.alert.id }, null, {
    ...v.data,
    merged: created.merged,
  });
  return NextResponse.json(
    { ok: true, alert: created.alert, merged: created.merged },
    { status: created.merged ? 200 : 201 },
  );
}

export const POST = withApiErrorHandling(POSTImpl);
