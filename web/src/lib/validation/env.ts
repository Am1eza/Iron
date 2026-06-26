import { z } from 'zod';

/**
 * Environment validation — fail-fast on misconfiguration.
 * Public vars are safe to import anywhere; server vars must only be read server-side.
 */

/* ---- Public (NEXT_PUBLIC_*) — safe in client + server ---- */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://fooladno.com'),
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
  })
  // In live mode, required secrets must be present.
  .superRefine((env, ctx) => {
    if (publicEnv.NEXT_PUBLIC_API_MODE !== 'live') return;
    const required: (keyof typeof env)[] = ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'KAVENEGAR_API_KEY', 'SESSION_SECRET'];
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key as string], message: `${String(key)} در حالت live الزامی است.` });
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
