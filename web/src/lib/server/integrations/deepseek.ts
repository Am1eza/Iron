/**
 * DeepSeek relay client — OpenAI-compatible chat completions through the
 * out-of-Iran relay (DEEPSEEK_BASE_URL). Streaming SSE with tool-calling.
 * Gated behind AI_ENABLED; grounding rule: the model talks, TOOLS decide
 * every number (acceptance-criteria §D).
 */
import { CONSTANTS } from '@/lib/config/constants';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export function aiEnabled(): boolean {
  return (
    process.env.AI_ENABLED === 'true' &&
    Boolean(process.env.DEEPSEEK_API_KEY) &&
    Boolean(process.env.DEEPSEEK_BASE_URL)
  );
}

/** Token accounting from the stream's final usage chunk (server-side telemetry
 *  only — never emitted to the client SSE). */
export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

/** POST one OpenAI-compatible streaming completion to a relay. */
function postCompletion(
  base: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
      // Ask for the final usage chunk (prompt/completion/cache tokens) so
      // per-request cost is measurable — the chunk stays server-side.
      stream_options: { include_usage: true },
      temperature: 0.3,
      // Advisor replies are short Persian answers (system prompt: "کوتاه و
      // کاربردی") — cap per-call generation so a request's cost is bounded
      // by call count × this. Raised 1000→2000: the multi-factory compare
      // answers were being silently truncated mid-sentence at 1000.
      max_tokens: 2000,
    }),
    signal,
  });
}

/**
 * Availability: when FALLBACK_BASE_URL + FALLBACK_API_KEY are set, a primary
 * relay failure (fetch throw or non-2xx) retries the SAME request ONCE
 * against the fallback relay (FALLBACK_MODEL, default: the primary model).
 * No fallback configured → the single attempt's failure surfaces unchanged.
 * aiEnabled() is deliberately untouched — the fallback is an extra leg, not
 * a way to run without the primary DEEPSEEK_* config.
 *
 * `signal` bounds the PRIMARY attempt (the caller's merged request-deadline
 * signal — unchanged behavior). `userSignal`, if given, is the RAW
 * user/request abort only (no timeout merged in) and is used for two things:
 *   1. deciding whether to even attempt the fallback — only a genuine user
 *      abort skips it; `signal` firing because the shared deadline elapsed
 *      does NOT (that used to be indistinguishable from a user abort, which
 *      meant a slow/hanging primary — exactly the case fallback exists for —
 *      silently never got a fallback attempt; US-25.6),
 *   2. giving the fallback leg its OWN short, independent timeout
 *      (AI_FALLBACK_TIMEOUT_MS) instead of inheriting a `signal` that may
 *      already be at (or past) its deadline.
 * Omitting `userSignal` reproduces the old behavior exactly (falls back to
 * `signal` for the retry leg) — kept optional for callers/tests that don't
 * need the distinction.
 */
async function fetchCompletion(
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
  userSignal?: AbortSignal,
): Promise<Response> {
  const primaryModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const fallbackBase = process.env.FALLBACK_BASE_URL;
  const fallbackKey = process.env.FALLBACK_API_KEY;
  const hasFallback = Boolean(fallbackBase && fallbackKey);

  let res: Response | null = null;
  try {
    res = await postCompletion(
      process.env.DEEPSEEK_BASE_URL!,
      process.env.DEEPSEEK_API_KEY!,
      primaryModel,
      messages,
      tools,
      signal,
    );
  } catch (e) {
    // A REAL user abort is not an outage — never burn the fallback on it.
    // A shared-deadline timeout firing is NOT the same thing (see doc above).
    // No distinct userSignal given → fall back to checking `signal` itself,
    // reproducing the exact old (pre-US-25.6) behavior for any caller that
    // hasn't been updated to pass one.
    const abortGate = userSignal ?? signal;
    if (!hasFallback || abortGate?.aborted) throw e;
  }
  if (res?.ok && res.body) return res;
  if (!hasFallback) throw new Error(`deepseek HTTP ${res?.status}`);

  const fallbackSignal = ((): AbortSignal | undefined => {
    if (!userSignal) return signal; // no distinct user signal known — old behavior
    const budget = AbortSignal.timeout(CONSTANTS.AI_FALLBACK_TIMEOUT_MS);
    return typeof AbortSignal.any === 'function' ? AbortSignal.any([userSignal, budget]) : budget;
  })();

  const retry = await postCompletion(
    fallbackBase!,
    fallbackKey!,
    process.env.FALLBACK_MODEL ?? primaryModel,
    messages,
    tools,
    fallbackSignal,
  );
  if (!retry.ok || !retry.body) throw new Error(`fallback HTTP ${retry.status}`);
  return retry;
}

/** One streaming completion call. Yields token deltas and collects tool calls.
 *  `userSignal`: the raw user/request abort, separate from `signal` (which may
 *  be a merged request-deadline signal) — see fetchCompletion's doc comment;
 *  only affects the fallback-relay decision, not the primary attempt. */
export async function* streamCompletion(
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
  userSignal?: AbortSignal,
): AsyncGenerator<
  | { type: 'token'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; usage: CompletionUsage }
  | { type: 'truncated' }
  | { type: 'done' }
> {
  const res = await fetchCompletion(messages, tools, signal, userSignal);

  // fetchCompletion only ever returns a response WITH a body (checked on both legs).
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Accumulate streamed tool-call fragments by index.
  const toolCalls = new Map<number, ToolCall>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.trim();
      if (!data.startsWith('data:')) continue;
      const payload = data.slice(5).trim();
      if (payload === '[DONE]') {
        if (toolCalls.size > 0) yield { type: 'tool_calls', calls: [...toolCalls.values()] };
        yield { type: 'done' };
        return;
      }
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
            };
            finish_reason?: string | null;
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_cache_hit_tokens?: number;
            prompt_cache_miss_tokens?: number;
          } | null;
        };
        const choice = json.choices?.[0];
        if (!choice) {
          // With stream_options.include_usage the FINAL chunk carries no
          // choices — only the request's token accounting (DeepSeek adds the
          // prompt_cache_hit/miss split on top of the OpenAI shape).
          if (json.usage) {
            yield {
              type: 'usage',
              usage: {
                promptTokens: json.usage.prompt_tokens ?? 0,
                completionTokens: json.usage.completion_tokens ?? 0,
                cacheHitTokens: json.usage.prompt_cache_hit_tokens ?? 0,
              },
            };
          }
          continue;
        }
        if (choice.delta?.content) yield { type: 'token', text: choice.delta.content };
        for (const tc of choice.delta?.tool_calls ?? []) {
          const existing = toolCalls.get(tc.index) ?? {
            id: tc.id ?? `call_${tc.index}`,
            type: 'function' as const,
            function: { name: '', arguments: '' },
          };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          toolCalls.set(tc.index, existing);
        }
        if (choice.finish_reason === 'tool_calls' && toolCalls.size > 0) {
          yield { type: 'tool_calls', calls: [...toolCalls.values()] };
          toolCalls.clear();
        }
        // The relay hit max_tokens mid-answer (a live truncation bug here
        // before — see the max_tokens comment in postCompletion). Let the
        // caller decide whether to ask the model to continue (US-27.5)
        // instead of silently handing the user a sentence cut off mid-word.
        if (choice.finish_reason === 'length') yield { type: 'truncated' };
      } catch {
        // skip malformed frame
      }
    }
  }
  if (toolCalls.size > 0) yield { type: 'tool_calls', calls: [...toolCalls.values()] };
  yield { type: 'done' };
}
