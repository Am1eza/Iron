import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listSettings, setSetting } from '@/lib/server/repos/settingsRepo';
import { finiteNumber } from '@/lib/validation/utils';

/**
 * Known keys with per-key validation — unknown keys are rejected. These
 * values are PERSISTED and read by every subsequent request (VAT/quote/
 * freight calculations across the whole app), so a non-finite value here is
 * higher-impact than a single bad request body — every numeric field uses
 * `finiteNumber` with a business-realistic ceiling, not bare `z.number()`.
 */
const KEY_SCHEMAS: Record<string, z.ZodTypeAny> = {
  VAT_RATE: finiteNumber.min(0).max(1),
  PRICE_STALE_HIDE_AFTER_DAYS: finiteNumber.int().min(1).max(30),
  QUOTE_VALIDITY_HOUR: finiteNumber.int().min(0).max(23),
  HOLIDAYS: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100),
  CLUB_TIERS: z.record(z.string(), z.object({ name: z.string(), minLeads: finiteNumber.int().min(0).max(100_000) })),
  LOGISTICS: z.object({
    originLabel: z.string().max(120),
    freightRatePerTonKm: finiteNumber.positive().max(1_000_000_000),
    freightMinTrip: finiteNumber.positive().max(1e13),
    handlingPerTon: finiteNumber.min(0).max(1e13),
    insuranceRate: finiteNumber.min(0).max(0.2),
    scaleFee: finiteNumber.min(0).max(1e13),
    cities: z.array(z.object({ name: z.string().max(60), km: finiteNumber.min(0).max(100_000) })).max(200),
  }),
  ALERT_MAX_ACTIVE_PER_USER: finiteNumber.int().min(1).max(200),
};

/** GET /api/admin/settings. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'settings:write');
  if ('response' in auth) return auth.response;
  const settings = await listSettings();
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

const putPayload = z.object({ key: z.string().min(1), value: z.unknown() });

/** PUT /api/admin/settings — one validated key at a time. */
async function PUTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'settings:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, putPayload);
  if (!v.ok) return v.response;

  const schema = KEY_SCHEMAS[v.data.key];
  if (!schema) {
    return NextResponse.json({ error: 'unknown_key', message: 'کلید تنظیمات ناشناخته است.' }, { status: 400 });
  }
  const parsed = schema.safeParse(v.data.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_value', message: 'مقدار نامعتبر است.' }, { status: 422 });
  }
  await setSetting(v.data.key, parsed.data);
  await audit(auth.session.id, 'settings.update', { type: 'setting', id: v.data.key }, null, { value: parsed.data });
  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const PUT = withApiErrorHandling(PUTImpl);
