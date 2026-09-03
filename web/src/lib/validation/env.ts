import { z } from 'zod';

/**
 * Environment validation — fail-fast on misconfiguration.
 * Public vars are safe to import anywhere; server vars must only be read server-side.
 */

/* ---- Public (NEXT_PUBLIC_*) — safe in client + server ---- */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://ahantime.com'),
  NEXT_PUBLIC_API_MODE: z.enum(['mock', 'live']).default('mock'),
  // Free-form label for whichever deployment served this build — no
  // behavioral effect, just surfaced on /api/health so a geo-routing setup
  // (see GEO-ROUTING.md) can be verified by curling from each region and
  // confirming the expected origin actually answered. Set per-deployment:
  // docker-compose.yml → "ir-docker", wrangler.jsonc vars → "cloudflare-edge".
  NEXT_PUBLIC_DEPLOY_REGION: z.string().default('unknown'),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
  NEXT_PUBLIC_DEPLOY_REGION: process.env.NEXT_PUBLIC_DEPLOY_REGION,
});

/* ---- Server-only — validated lazily on the server ---- */
const serverSchema = z
  .object({
    // AI relay. Provider-NEUTRAL names (the site moved off DeepSeek to
    // Parspack AI Studio; naming env vars after a vendor is what made that a
    // forty-file change). The DEEPSEEK_* names are still accepted so a live
    // .env keeps booting until the owner migrates it — see
    // integrations/aiRelayConfig.ts, which resolves the pair the same way.
    AI_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    // docker-compose passes unset optional vars as empty strings (`${VAR:-}`),
    // and `''` fails `.url()` even though the var is semantically absent —
    // which aborted boot with «پیکربندی محیط نامعتبر است». Normalize '' → undefined.
    AI_BASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
    DEEPSEEK_BASE_URL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().url().optional(),
    ),
    // No default here: the real default lives in aiRelayConfig.ts#aiModel, so
    // there is exactly one place that decides which model is used.
    AI_MODEL: z.string().optional(),
    DEEPSEEK_MODEL: z.string().optional(),
    // How much private reasoning the model may spend. See
    // aiRelayConfig.ts#reasoningEffort — unconstrained, the current model
    // burns ~95% of its tokens thinking and blows the AI_TIMEOUT_MS budget on
    // any tool round trip. 'off' omits the parameter entirely.
    AI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high', 'off']).optional(),
    SMSIR_API_KEY: z.string().optional(),
    SMSIR_TEMPLATE_ID: z.string().optional(),
    SMSIR_LINE_NUMBER: z.string().optional(),
    // Verify-API template ids for structured customer notifications — each
    // is fully optional; sendNotification() (integrations/smsir.ts) falls
    // back to the free-text bulk send on SMSIR_LINE_NUMBER whenever unset,
    // so nothing here can regress current behaviour. See docs/SMS-TEMPLATES.md
    // for the exact template text to register on the SMS.ir panel and get
    // these ids. Deliberately NOT in the production-required list below —
    // unlike SMSIR_LINE_NUMBER, going without one of these just means that
    // ONE message type stays on the (already-required) bulk line, not that
    // the whole notification surface goes dark.
    SMSIR_TEMPLATE_ID_PROFORMA_REQUEST: z.string().optional(),
    SMSIR_TEMPLATE_ID_PROFORMA_ISSUED: z.string().optional(),
    SMSIR_TEMPLATE_ID_PROFORMA_REMINDER: z.string().optional(),
    SMSIR_TEMPLATE_ID_ORDER_CONFIRMED: z.string().optional(),
    // Post-creation shipment lifecycle (W17) — ORDER_CONFIRMED above fires
    // only once, at creation. Everything the shipment does AFTER that
    // (advancing through confirmed/loading/in_transit, a tracking number
    // landing, delivery, cancellation) needs its own notification so the
    // customer hears about it too, not just the rep seeing it in the panel.
    SMSIR_TEMPLATE_ID_ORDER_STATUS: z.string().optional(),
    SMSIR_TEMPLATE_ID_ORDER_DELIVERED: z.string().optional(),
    SMSIR_TEMPLATE_ID_ORDER_SHIPPING: z.string().optional(),
    SMSIR_TEMPLATE_ID_ORDER_CANCELLED: z.string().optional(),
    SMSIR_TEMPLATE_ID_PRICE_ALERT: z.string().optional(),
    SMSIR_TEMPLATE_ID_CALLBACK_REMINDER: z.string().optional(),
    // W20 — confirms a customer's «انبار مشتریان» storage request landed.
    SMSIR_TEMPLATE_ID_WAREHOUSE_REQUEST: z.string().optional(),
    BRSAPI_KEY: z.string().optional(),
    BRSAPI_URL: z.string().optional(),
    OUNCE_API_URL: z.string().optional(),
    SESSION_SECRET: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    // Defaults to enforced. A security gate must not turn itself off just
    // because a deployment target forgot to set it — see middleware.ts.
    AUTH_ENFORCED: z.enum(['true', 'false']).default('true'),
    AI_ENABLED: z.enum(['true', 'false']).default('false'),
    SEED_ON_START: z.enum(['true', 'false']).default('false'),
  })
  // Live mode structurally requires the DB + session secret — there is no
  // fallback path for either (auth literally cannot sign a JWT without
  // SESSION_SECRET), so these are required whenever live mode is on, dev or
  // prod. SMS.ir is different: sms.ts already has a real, tested dev-log
  // fallback for missing credentials, gated on NODE_ENV==='production' —
  // requiring the keys in EVERY live-mode context (including a developer
  // running `next dev` against a real local Postgres before they've signed
  // up for SMS.ir yet) would contradict that and block a legitimate
  // workflow, so this mirrors sms.ts's own condition instead of just
  // checking live-mode.
  //
  // SMSIR_LINE_NUMBER used to be excluded from that production list on the
  // theory that a missing free-text sender only degrades UX. It doesn't: the
  // whole پیش‌فاکتور/سفارش/alert/automation notification surface rides that
  // one variable, and smsir.ts now fails CLOSED in production when it is
  // absent — so leaving it optional only moved the failure from a boot error
  // (loud, one line, before any traffic) to per-send failures nobody reads.
  // A 2026-07 outage where free-text SMS was dead for days while OTP kept
  // working (the Verify endpoint needs no line) is exactly what boot-time
  // validation is for. Only the domestic market-rates feed (falls back to
  // last-known values) and the AI relay keys (gated on AI_ENABLED) still
  // degrade without blocking boot.
  .superRefine((env, ctx) => {
    if (publicEnv.NEXT_PUBLIC_API_MODE === 'live') {
      for (const key of ['DATABASE_URL', 'SESSION_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} در حالت live الزامی است.` });
        }
      }
      if (process.env.NODE_ENV === 'production') {
        for (const key of ['SMSIR_API_KEY', 'SMSIR_TEMPLATE_ID', 'SMSIR_LINE_NUMBER'] as const) {
          if (!env[key]) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} در production الزامی است.` });
          }
        }
      }
    }
    if (env.AI_ENABLED === 'true') {
      // EITHER spelling satisfies the requirement — a deployment that has only
      // migrated half its variable names must still boot.
      const pairs = [
        ['AI_API_KEY', 'DEEPSEEK_API_KEY'],
        ['AI_BASE_URL', 'DEEPSEEK_BASE_URL'],
      ] as const;
      for (const [modern, legacy] of pairs) {
        if (!env[modern] && !env[legacy]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [modern],
            message: `${modern} برای فعال‌سازی دستیار هوشمند الزامی است.`,
          });
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
