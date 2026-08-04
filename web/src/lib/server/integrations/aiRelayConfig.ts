/**
 * Which AI relay to talk to, and how hard to let it think.
 *
 * ── The provider changed ──────────────────────────────────────────────────
 * DeepSeek is gone: the relay was permanently at HTTP 402 (credit exhausted)
 * and the OWNER moved the site to Parspack's AI Studio proxy. That overrides
 * the "AI = DeepSeek" line in CLAUDE.md's locked-decisions table, which has
 * been updated to match. Everything else about the decision is unchanged:
 * server-side only, through an out-of-Iran relay, grounded — the model talks,
 * TOOLS decide every number.
 *
 * ── Why the names are read twice ──────────────────────────────────────────
 * The variables are `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`, because naming
 * them after one vendor is exactly what made this migration touch forty
 * places. But the live `.env` still uses `DEEPSEEK_*`, so every lookup falls
 * back to the old name: the running container keeps working the moment this
 * lands, and the owner can migrate `.env` afterwards on their own schedule.
 * The fallbacks are cheap and can be deleted once `.env` is migrated.
 */

/** First non-empty value among the given env keys. Empty string counts as
 *  unset: docker-compose passes absent optional vars as `${VAR:-}`. */
function pick(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function aiBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'AI_BASE_URL', 'DEEPSEEK_BASE_URL');
}
export function aiApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'AI_API_KEY', 'DEEPSEEK_API_KEY');
}
/** The owner asked for exactly this model and no other. */
export const DEFAULT_AI_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
export function aiModel(env: NodeJS.ProcessEnv = process.env): string {
  return pick(env, 'AI_MODEL', 'DEEPSEEK_MODEL') ?? DEFAULT_AI_MODEL;
}

/* ----------------------------- fallback relay ---------------------------- */
export function aiFallbackBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'AI_FALLBACK_BASE_URL', 'FALLBACK_BASE_URL');
}
export function aiFallbackApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return pick(env, 'AI_FALLBACK_API_KEY', 'FALLBACK_API_KEY');
}
export function aiFallbackModel(env: NodeJS.ProcessEnv = process.env): string {
  return pick(env, 'AI_FALLBACK_MODEL', 'FALLBACK_MODEL') ?? aiModel(env);
}

/* ---------------------------- reasoning effort --------------------------- */
/**
 * The current model is a REASONING model, and left alone it is unusable here.
 * Measured on the live endpoint: one short Persian greeting produced 1878
 * reasoning deltas against 88 content deltas — roughly 95% of the tokens (and
 * of the latency) spent on thinking the user never sees. The reply arrives on
 * `delta.reasoning`, not `delta.content`, so the stream parser correctly
 * ignores it; the tokens are billed and the wall-clock is spent regardless.
 *
 * That is what broke /api/ai/chat in production: a tool round trip (model →
 * tool → model) at unconstrained effort cannot finish inside AI_TIMEOUT_MS,
 * so every answer ended in a timeout and an error frame after 20 seconds.
 *
 * `low` is the default because it is the measured sweet spot: 253 characters
 * of reasoning instead of thousands, and TOOL CALLING STILL FIRES — which is
 * the whole product (the model talks, tools decide every number). `none` (0
 * reasoning) is available but is not the default: it removes the margin that
 * makes multi-step tool selection reliable, and this app's answers depend on
 * picking the right tool far more than on prose.
 *
 * `off` disables the parameter entirely, for a future provider that rejects
 * an unknown field rather than ignoring it.
 */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';
const VALID: readonly string[] = ['none', 'low', 'medium', 'high'];

export function reasoningEffort(env: NodeJS.ProcessEnv = process.env): ReasoningEffort | undefined {
  const raw = env.AI_REASONING_EFFORT?.trim().toLowerCase();
  if (raw === 'off') return undefined;
  // An unrecognised value falls back to `low` rather than to "unconstrained":
  // a typo must not silently restore the behaviour that took the advisor down.
  return VALID.includes(raw ?? '') ? (raw as ReasoningEffort) : 'low';
}
