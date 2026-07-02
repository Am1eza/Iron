import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { upsertMarketValue, getMarketValue } from '@/lib/server/repos/marketRepo';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { finiteNumber } from '@/lib/validation/utils';

const payload = z.object({ value: finiteNumber.positive().max(1e13) });

/** PUT /api/admin/market/billet — the one admin-entered ticker value (شمش). */
export async function PUT(req: NextRequest) {
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
  void evaluateAlerts().catch(() => {});
  return NextResponse.json({ value: updated });
}
