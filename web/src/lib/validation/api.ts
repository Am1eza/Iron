import { z } from 'zod';
import { mobileSchema, otpCodeSchema } from './schemas';
import { M } from './messages';
import { finiteNumber } from './utils';

/* ---------- request payloads (server re-validates these) ---------- */
const priceUnit = z.enum(['kg', 'branch', 'sheet', 'meter']);

export const otpRequestPayload = z.object({
  mobile: mobileSchema,
  // Optional name captured at first request → used to register a new account.
  name: z.string().trim().min(1).max(60).optional(),
});
export const otpVerifyPayload = z.object({ mobile: mobileSchema, code: otpCodeSchema });
export const profileUpdatePayload = z.object({ name: z.string().trim().min(1).max(60) });

export const leadPayload = z.object({
  contact: z.object({ name: z.string().max(60).optional(), mobile: mobileSchema }),
  items: z
    .array(
      z.object({
        skuId: z.string().min(1).max(120),
        qty: finiteNumber.positive().max(100_000),
        unit: priceUnit,
      }),
    )
    .min(1, { message: M.required })
    .max(100),
  channel: z.enum(['sms', 'whatsapp', 'telegram', 'eitaa']).default('sms'),
  source: z.string().max(40).optional(),
  note: z.string().trim().max(1000).optional(),
});

/* ---------- external/response schemas (parse at the boundary) ---------- */
export const marketValueSchema = z.object({
  key: z.enum(['usd', 'eur', 'gold18', 'ounce', 'billet']),
  label: z.string(),
  value: finiteNumber,
  unit: z.string(),
  source: z.enum(['tgju', 'admin']),
  movementDir: z.enum(['up', 'down', 'flat']),
  movementPct: finiteNumber.optional(),
  updatedAt: z.string(),
  isStale: z.boolean(),
});
export const marketResponseSchema = z.object({ values: z.array(marketValueSchema) });

/* ---------- URL / filter params (tolerant; safe defaults) ---------- */
export const catalogFiltersSchema = z.object({
  سایز: z.string().optional(),
  گرید: z.string().optional(),
  کارخانه: z.string().optional(),
  sort: z.enum(['price', 'size', 'movement']).optional(),
});
export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

/** Parse URLSearchParams → typed filters with safe defaults on bad input. */
export function parseFilters(params: URLSearchParams | Record<string, string | undefined>): CatalogFilters {
  const obj =
    params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
  const r = catalogFiltersSchema.safeParse(obj);
  return r.success ? r.data : {};
}
