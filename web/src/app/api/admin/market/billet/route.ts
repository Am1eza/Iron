import { NextResponse, type NextRequest, after } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { upsertMarketValue, getMarketValue } from '@/lib/server/repos/marketRepo';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';
import { reportError } from '@/lib/errors/report';
import { finiteNumber } from '@/lib/validation/utils';

const payload = z.object({ value: finiteNumber.positive().max(1e13) });

/**
 * PUT /api/admin/market/billet — manual override for the شمش فولاد ticker value.
 *
 * Billet is no longer admin-ONLY: it is polled from esfahanahan every 15 min
 * (jobs/billetPoll.job.ts). This route stays as the override for when the owner
 * has a better number than the feed — a mill quote off a phone call, or the
 * feed publishing something obviously wrong. Writing `source: 'admin'` here
 * gives that value a hold window (BILLET_ADMIN_HOLD_HOURS, default 6h) during
 * which `refreshBillet()` will not overwrite it; after that the feed resumes,
 * deliberately, so a forgotten override can't strand the ticker the way the
 * pre-automation flow did (60,800 for a week against a real 66,750–67,700).
 */
async function PUTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'market:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const before = await getMarketValue('billet');
  const updated = await upsertMarketValue({
    key: 'billet',
    value: v.data.value,
    label: 'شمش فولاد',
    unit: 'تومان',
    source: 'admin',
  });
  await audit(auth.session.id, 'market.billet', { type: 'market', id: 'billet' }, { value: before?.value }, { value: v.data.value });
  // W23 review fix: this route never revalidated anything (every SKU detail
  // page shows the billet reference — src/app/prices/[category]/[sub]/[sku]/
  // page.tsx's getBilletReference()) and swallowed evaluateAlerts() errors
  // entirely, on top of the same not-guaranteed-to-finish risk the pricing
  // route's `after()` fix closes — see that route's comment for why.
  after(() => evaluateAlerts().catch((err) => reportError(err, { route: 'admin/market/billet', stage: 'evaluateAlerts' })));
  safeRevalidatePath('/prices', 'layout');
  safeRevalidatePath('/market', 'page');
  return NextResponse.json({ value: updated });
}

export const PUT = withApiErrorHandling(PUTImpl);
