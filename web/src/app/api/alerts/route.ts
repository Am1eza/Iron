import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb } from '@/lib/server/utils/apiGuard';
import { createAlert, activeAlertCount } from '@/lib/server/repos/alertsRepo';
import { getSetting } from '@/lib/server/repos/settingsRepo';
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
export async function POST(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;

  const v = await validateBody(req, alertPayload);
  if (!v.ok) return v.response;

  const cap = await getSetting<number>('ALERT_MAX_ACTIVE_PER_USER', 20);
  if ((await activeAlertCount(auth.session.id)) >= cap) {
    return NextResponse.json(
      { error: 'limit', message: `حداکثر ${cap} هشدار فعال می‌توانید داشته باشید.` },
      { status: 409 },
    );
  }
  const { alert, merged } = await createAlert({ userId: auth.session.id, ...v.data });
  return NextResponse.json(
    { ok: true, alert, merged },
    { status: merged ? 200 : 201 },
  );
}
