import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listSettings, setSetting } from '@/lib/server/repos/settingsRepo';
import { finiteNumber } from '@/lib/validation/utils';
import { logisticsSettingSchema } from '@/lib/validation/settingsSchemas';

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
  ORDER_POLICY: z
    .object({
      version: z.string().trim().min(1).max(40),
      minimumAutoQuoteToman: finiteNumber.int().min(0).max(1e15),
      maximumManagerDiscountRate: finiteNumber.min(0).max(0.1),
      maximumTotalDiscountRate: finiteNumber.min(0).max(0.1),
    })
    .refine((policy) => policy.maximumManagerDiscountRate <= policy.maximumTotalDiscountRate, {
      message: 'سقف تخفیف دستی نمی‌تواند از سقف کل تخفیف بیشتر باشد.',
    }),
  VOLUME_DISCOUNT_POLICY: z.object({
    version: z.string().trim().min(1).max(40),
    tiers: z
      .array(
        z.object({
          id: z.enum(['retail', 'bulk', 'enterprise']),
          minWeightKg: finiteNumber.int().min(0).max(10_000_000),
          discountRate: finiteNumber.min(0).max(0.1),
          label: z.string().trim().min(1).max(60),
          benefits: z.array(z.string().trim().min(1).max(120)).max(10),
        }),
      )
      .length(3)
      .refine((tiers) => new Set(tiers.map((tier) => tier.id)).size === 3, 'هر سطح باید دقیقاً یک‌بار وجود داشته باشد.'),
  }).superRefine((policy, ctx) => {
    const byId = Object.fromEntries(policy.tiers.map((tier) => [tier.id, tier]));
    const retail = byId.retail;
    const bulk = byId.bulk;
    const enterprise = byId.enterprise;
    if (!retail || !bulk || !enterprise) return;
    if (retail.minWeightKg !== 0 || retail.discountRate !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'سطح خرده باید از صفر و بدون تخفیف شروع شود.' });
    }
    if (!(bulk.minWeightKg > retail.minWeightKg && enterprise.minWeightKg > bulk.minWeightKg)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'حدنصاب سطح‌ها باید صعودی باشد.' });
    }
    if (!(bulk.discountRate >= retail.discountRate && enterprise.discountRate >= bulk.discountRate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'درصد تخفیف سطح‌ها نباید کاهش پیدا کند.' });
    }
  }),
  HOLIDAYS: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100),
  // Hybrid-points club model (clubPoints.ts) — weights + tier thresholds.
  CLUB_CONFIG: z.object({
    weights: z.object({
      order: finiteNumber.min(0).max(1000),
      profile: finiteNumber.min(0).max(1000),
      level2: finiteNumber.min(0).max(1000),
      level3: finiteNumber.min(0).max(1000),
      referral: finiteNumber.min(0).max(1000),
    }),
    tiers: z.record(z.string(), z.object({ name: z.string().max(40), minPoints: finiteNumber.int().min(0).max(1_000_000) })),
  }),
  SMS_AUTOMATIONS: z.object({
    welcome: z.boolean(),
    proformaReminder: z.boolean(),
    proformaExpired: z.boolean().default(true),
    callbackReminder: z.boolean(),
    weeklyReport: z.boolean().default(true),
  }),
  SITE_CONTACT: z.object({
    address: z.string().min(1).max(300),
    phoneLandline: z.string().min(1).max(20),
    phoneMobile: z.string().min(1).max(20),
    email: z.string().email().max(120).optional().or(z.literal('')),
  }),
  LOGISTICS: logisticsSettingSchema,
  // W22: per-tier active-alert cap — replaces the old flat
  // ALERT_MAX_ACTIVE_PER_USER (one number for everyone). `base` covers both
  // a non-member and the zero-effort `iron` tier on purpose — see
  // alertsRepo.ts's DEFAULT_ALERT_TIER_CAPS doc comment.
  ALERT_TIER_CAPS: z.object({
    base: finiteNumber.int().min(1).max(200),
    iron: finiteNumber.int().min(1).max(200),
    steel: finiteNumber.int().min(1).max(200),
    poolad: finiteNumber.int().min(1).max(200),
  }),
  // Homepage hero motion graphic — a same-origin video path (e.g. an upload
  // under /uploads/). Empty url = the live price board renders instead.
  // Same-origin only: an absolute URL here would let a settings write embed
  // third-party content on the homepage.
  SITE_HERO_VIDEO: z.object({
    url: z
      .string()
      .max(300)
      .regex(/^$|^\/(?!\/)/, 'مسیر باید با / شروع شود (فایل روی همین سایت)'),
  }),
  // AI system-prompt A/B testing (US-05.5) — fewer than 2 versions means
  // A/B is off (see promptVersions.ts); capped at 4 to keep the DeepSeek
  // cache-prefix fan-out (one prefix per version) bounded.
  AI_PROMPT_VERSIONS: z.object({
    versions: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(40),
          label: z.string().trim().min(1).max(80),
          prompt: z.string().trim().min(1).max(8000),
        }),
      )
      .max(4),
  }),
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
  const storedValue =
    v.data.key === 'LOGISTICS'
      ? { ...(parsed.data as Record<string, unknown>), verifiedAt: new Date().toISOString() }
      : parsed.data;
  await setSetting(v.data.key, storedValue);
  await audit(auth.session.id, 'settings.update', { type: 'setting', id: v.data.key }, null, { value: storedValue });
  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const PUT = withApiErrorHandling(PUTImpl);
