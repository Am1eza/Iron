import { z } from 'zod';
import { normalizeDigits, normalizeMobile } from '@/lib/utils/format';
import { M } from './messages';

/* ---- shared fields ---- */
export const mobileSchema = z
  .string()
  .min(1, { message: M.required })
  .superRefine((val, ctx) => {
    if (!normalizeMobile(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: M.mobile });
  });

export const otpCodeSchema = z.string().superRefine((val, ctx) => {
  if (!/^\d{5}$/.test(normalizeDigits(val))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: M.otp });
  }
});

const numberSchema = z.preprocess(
  (v) => {
    const n = Number(normalizeDigits(String(v ?? '')).trim());
    return Number.isFinite(n) ? n : undefined;
  },
  z.number({ required_error: M.positive, invalid_type_error: M.positive }).positive({ message: M.positive }),
);

/* ---- form schemas ---- */
export const loginMobileSchema = z.object({
  mobile: mobileSchema,
  name: z.string().optional(),
});
export type LoginMobileValues = z.infer<typeof loginMobileSchema>;

export const otpSchema = z.object({ code: otpCodeSchema });
export type OtpValues = z.infer<typeof otpSchema>;

export const requestSchema = z.object({
  name: z.string().min(1, { message: M.name }),
  mobile: mobileSchema,
  channel: z.enum(['sms', 'whatsapp']),
});
export type RequestValues = z.infer<typeof requestSchema>;

export const cooperationSchema = z.object({
  track: z.enum(['analysis', 'supply', 'sell']),
  company: z.string().min(1, { message: M.required }),
  product: z.string().optional(),
  mobile: mobileSchema,
  message: z.string().optional(),
});
export type CooperationValues = z.infer<typeof cooperationSchema>;

export const contactSchema = z.object({
  name: z.string().min(1, { message: M.name }),
  mobile: mobileSchema,
  message: z.string().min(5, { message: M.message }),
});
export type ContactValues = z.infer<typeof contactSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1, { message: M.name }).max(60),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const weightSchema = z.object({
  category: z.string().min(1, { message: M.selectOne }),
  size: z.string().min(1, { message: M.required }),
  qty: numberSchema,
});
export type WeightValues = z.infer<typeof weightSchema>;
