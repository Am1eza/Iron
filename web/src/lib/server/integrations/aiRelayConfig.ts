/**
 * Which AI relay to talk to, and how hard to let it think.
 *
 * ── The provider changed (again) ──────────────────────────────────────────
 * Parspack AI Studio → Surplus Intelligence (`gpt-5.6-luna`), 1405/06 — the
 * owner's decision. Before that this was DeepSeek → Parspack, when the
 * DeepSeek relay hit a permanent HTTP 402. Both moves update the "AI" line in
 * CLAUDE.md's locked-decisions table to match. Everything else about the
 * decision is unchanged: server-side only, through an out-of-Iran relay,
 * grounded — the model talks, TOOLS decide every number.
 *
 * Verified against the live Surplus endpoint before this landed: plain chat,
 * tool-calling (`finish_reason: 'tool_calls'`, arguments parse correctly),
 * and streaming — all byte-for-byte the OpenAI chat-completions shape this
 * client already parses. `reasoning_effort: 'low'` is accepted without error
 * and the measured response carried `reasoning_tokens: 0`, so the capped
 * default below costs nothing here even if this model turns out not to be a
 * reasoning model at all.
 *
 * ── Why the names are read twice ──────────────────────────────────────────
 * The variables are `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`, because naming
 * them after one vendor is exactly what made the FIRST migration touch forty
 * places — a mistake deliberately not repeated for Surplus: there is no
 * `SURPLUS_*` name anywhere in this file, only new values for the same three
 * provider-neutral keys. The legacy `DEEPSEEK_*` fallback stays for now
 * because the live `.env` still sets it (redundantly, alongside `AI_*`) from
 * the Parspack migration — cheap to keep, safe to delete once `.env` is
 * cleaned up.
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
export const DEFAULT_AI_MODEL = 'gpt-5.6-luna';
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
