import { z } from 'zod';
import { mobileSchema, otpCodeSchema } from './schemas';
import { M } from './messages';
import { finiteNumber } from './utils';

/* ---------- request payloads (server re-validates these) ---------- */
const priceUnit = z.enum(['kg', 'branch', 'sheet', 'meter']);

export const otpRequestPayload = z.object({
  mobile: mobileSchema,
  // Optional display name captured at first request → personalizes the "code
  // sent" copy. Structured registration fields ride in on verify (below).
  name: z.string().trim().min(1).max(60).optional(),
});
export const otpVerifyPayload = z.object({
  mobile: mobileSchema,
  code: otpCodeSchema,
  // Registration fields — applied ONLY when this OTP creates a new account.
  // Required-name is enforced client-side before the OTP is even requested;
  // here they stay optional so a returning user's verify (no reg) is valid.
  firstName: z.string().trim().min(1).max(40).optional(),
  lastName: z.string().trim().min(1).max(40).optional(),
  inviteCode: z.string().trim().max(16).optional(),
});
export const profileUpdatePayload = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(40),
});

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
