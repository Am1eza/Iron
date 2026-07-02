import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { listSettings, setSetting } from '@/lib/server/repos/settingsRepo';

/** Known keys with per-key validation — unknown keys are rejected. */
const KEY_SCHEMAS: Record<string, z.ZodTypeAny> = {
  VAT_RATE: z.number().min(0).max(1),
  PRICE_STALE_HIDE_AFTER_DAYS: z.number().int().min(1).max(30),
  QUOTE_VALIDITY_HOUR: z.number().int().min(0).max(23),
  HOLIDAYS: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100),
  CLUB_TIERS: z.record(z.string(), z.object({ name: z.string(), minLeads: z.number().int().min(0) })),
  LOGISTICS: z.object({
    originLabel: z.string(),
    freightRatePerTonKm: z.number().positive(),
    freightMinTrip: z.number().positive(),
    handlingPerTon: z.number().min(0),
    insuranceRate: z.number().min(0).max(0.2),
    scaleFee: z.number().min(0),
    cities: z.array(z.object({ name: z.string(), km: z.number().min(0) })).max(200),
  }),
  ALERT_MAX_ACTIVE_PER_USER: z.number().int().min(1).max(200),
};

/** GET /api/admin/settings. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'settings:write');
  if ('response' in auth) return auth.response;
  const settings = await listSettings();
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

const putPayload = z.object({ key: z.string().min(1), value: z.unknown() });

/** PUT /api/admin/settings — one validated key at a time. */
export async function PUT(req: NextRequest) {
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
