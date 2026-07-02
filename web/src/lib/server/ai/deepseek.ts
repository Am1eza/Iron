/**
 * Minimal OpenAI-compatible chat client for DeepSeek via the out-of-Iran relay.
 * fetch-based (zero deps → works on the Cloudflare Workers runtime), non-stream:
 * the engine buffers each completion so the grounding validator can inspect the
 * FULL text before a single character reaches the user (AC-D-3), then re-streams.
 */
import { getServerEnv } from '@/lib/validation/env';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletion {
  content: string;
  toolCalls: ToolCall[];
}

export interface RelayConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getRelayConfig(): RelayConfig | null {
  const env = getServerEnv();
  if (!env.DEEPSEEK_API_KEY || !env.DEEPSEEK_BASE_URL) return null;
  return { apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL.replace(/\/$/, ''), model: env.DEEPSEEK_MODEL };
}

export interface CompleteOptions {
  tools?: unknown[];
  maxTokens: number;
  signal: AbortSignal;
  /** fetch override for tests. */
  fetchImpl?: typeof fetch;
}

/** One chat-completion round. Throws on HTTP/network errors (engine maps to AC-D-9 fallback). */
export async function complete(
  cfg: RelayConfig,
  messages: ChatMessage[],
  opts: CompleteOptions,
): Promise<ChatCompletion> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    signal: opts.signal,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      tools: opts.tools,
      max_tokens: opts.maxTokens,
      // Factual/tool-driven assistant → low temperature; numbers come from tools anyway.
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`relay ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  return { content: msg?.content ?? '', toolCalls: msg?.tool_calls ?? [] };
}
