import { z } from 'zod';
import { normalizeDigits, normalizeMobile } from '@/lib/utils/format';
import { CONSTANTS } from '@/lib/config/constants';
import { M } from './messages';

/** E.164 shape: `+` then a country digit and 7–14 more (8–15 total). */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Accepts the app's canonical stored mobile shape: Iran's existing
 * 09XXXXXXXXX (via normalizeMobile, unchanged — same check every current
 * user/OTP row already passed) OR a full E.164 number for any other country.
 *
 * The non-Iran path is validated by E.164 *format* only (not the full
 * libphonenumber metadata check) on purpose: importing `libphonenumber-js/min`
 * here dragged ~120KB into the shared client bundle of every page (this schema
 * module is imported app-wide), for a branch that only non-Iran contact/lead
 * numbers ever reach — and those are stored, never OTP'd (SMS.ir OTP is
 * Iran-only, so an international number can never log in regardless). PhoneField
 * still resolves country + national into canonical E.164 before submit.
 */
export const mobileSchema = z
  .string()
  .min(1, { message: M.required })
  .superRefine((val, ctx) => {
    const ok = normalizeMobile(val) !== null || E164.test(val.trim());
    if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: M.mobile });
  });

const OTP_RE = new RegExp(`^\\d{${CONSTANTS.OTP_LENGTH}}$`);
export const otpCodeSchema = z.string().superRefine((val, ctx) => {
  if (!OTP_RE.test(normalizeDigits(val))) {
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
  firstName: z.string().trim().min(1, { message: M.name }).max(40),
  lastName: z.string().trim().min(1, { message: M.name }).max(40),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const weightSchema = z.object({
  category: z.string().min(1, { message: M.selectOne }),
  size: z.string().min(1, { message: M.required }),
  qty: numberSchema,
});
export type WeightValues = z.infer<typeof weightSchema>;
