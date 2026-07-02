import { z } from 'zod';

/**
 * Environment validation — fail-fast on misconfiguration.
 * Public vars are safe to import anywhere; server vars must only be read server-side.
 */

/* ---- Public (NEXT_PUBLIC_*) — safe in client + server ---- */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://ahantime.com'),
  NEXT_PUBLIC_API_MODE: z.enum(['mock', 'live']).default('mock'),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
});

/* ---- Server-only — validated lazily on the server ---- */
const serverSchema = z
  .object({
    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_BASE_URL: z.string().url().optional(),
    DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
    KAVENEGAR_API_KEY: z.string().optional(),
    KAVENEGAR_SENDER: z.string().optional(),
    TGJU_BASE_URL: z.string().optional(),
    SESSION_SECRET: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    AUTH_ENFORCED: z.enum(['true', 'false']).default('false'),
    AI_ENABLED: z.enum(['true', 'false']).default('false'),
    SEED_ON_START: z.enum(['true', 'false']).default('false'),
  })
  // Live mode requires the DB + session secret. Integrations stay optional and
  // degrade gracefully (SMS -> dev log, ticker -> last-known values); the AI
  // relay keys are only required once the feature flag is on.
  .superRefine((env, ctx) => {
    if (publicEnv.NEXT_PUBLIC_API_MODE === 'live') {
      for (const key of ['DATABASE_URL', 'SESSION_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} در حالت live الزامی است.` });
        }
      }
    }
    if (env.AI_ENABLED === 'true') {
      for (const key of ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} برای فعال‌سازی دستیار هوشمند الزامی است.` });
        }
      }
    }
  });

let cached: z.infer<typeof serverSchema> | null = null;

/** Read + validate server env (throws on invalid). Call from server contexts only. */
export function getServerEnv() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`پیکربندی محیط نامعتبر است:\n${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  cached = parsed.data;
  return cached;
}
