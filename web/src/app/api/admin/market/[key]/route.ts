import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { upsertMarketValue, getMarketValue } from '@/lib/server/repos/marketRepo';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { finiteNumber } from '@/lib/validation/utils';
import type { MarketKey } from '@/lib/types/domain';

const payload = z.object({ value: finiteNumber.positive().max(1e13) });

/** Label/unit per admin-editable ticker — matches the tgju poll's canon so an
 *  admin override renders identically in the sitewide ticker. */
const TICKERS: Record<MarketKey, { label: string; unit: string }> = {
  usd: { label: 'دلار', unit: 'تومان' },
  eur: { label: 'یورو', unit: 'تومان' },
  gold18: { label: 'طلای ۱۸', unit: 'تومان' },
  ounce: { label: 'انس جهانی', unit: 'دلار' },
  billet: { label: 'شمش فولاد', unit: 'تومان' },
};

/**
 * PUT /api/admin/market/[key] — admin entry/override for ANY ticker value.
 * billet has always been admin-entered; the tgju-backed keys (usd/eur/gold18/
 * ounce) gain a manual override for when the feed is unset or stale — the
 * next successful poll simply writes over it.
 */
async function PUTImpl(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'market:write');
  if ('response' in auth) return auth.response;

  const { key } = await ctx.params;
  if (!(key in TICKERS)) {
    return NextResponse.json({ error: 'not_found', message: 'شاخص یافت نشد.' }, { status: 404 });
  }
  const marketKey = key as MarketKey;

  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const before = await getMarketValue(marketKey);
  const updated = await upsertMarketValue({
    key: marketKey,
    value: v.data.value,
    label: TICKERS[marketKey].label,
    unit: TICKERS[marketKey].unit,
    source: 'admin',
  });
  await audit(
    auth.session.id,
    `market.${marketKey}`,
    { type: 'market', id: marketKey },
    { value: before?.value },
    { value: v.data.value },
  );
  void evaluateAlerts().catch(() => {});
  return NextResponse.json({ value: updated });
}

export const PUT = withApiErrorHandling(PUTImpl);
