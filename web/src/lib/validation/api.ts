import { z } from 'zod';
import { mobileSchema, otpCodeSchema } from './schemas';
import { M } from './messages';

/* ---------- request payloads (server re-validates these) ---------- */
const priceUnit = z.enum(['kg', 'branch', 'sheet', 'meter']);

export const otpRequestPayload = z.object({ mobile: mobileSchema });
export const otpVerifyPayload = z.object({ mobile: mobileSchema, code: otpCodeSchema });

export const leadPayload = z.object({
  contact: z.object({ name: z.string().optional(), mobile: mobileSchema }),
  items: z
    .array(
      z.object({
        skuId: z.string().min(1),
        qty: z.number().positive(),
        unit: priceUnit,
      }),
    )
    .min(1, { message: M.required }),
  channel: z.enum(['sms', 'whatsapp']).default('sms'),
  source: z.string().optional(),
});

export const weightPayload = z.object({
  theoreticalWeightKg: z.number().positive({ message: M.positive }),
  qty: z.number().positive({ message: M.positive }),
});

/* ---------- external/response schemas (parse at the boundary) ---------- */
export const marketValueSchema = z.object({
  key: z.enum(['usd', 'eur', 'gold18', 'ounce', 'billet']),
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  source: z.enum(['tgju', 'admin']),
  movementDir: z.enum(['up', 'down', 'flat']),
  movementPct: z.number().optional(),
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
