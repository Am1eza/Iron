/**
 * DeepSeek relay client — OpenAI-compatible chat completions through the
 * out-of-Iran relay (DEEPSEEK_BASE_URL). Streaming SSE with tool-calling.
 * Gated behind AI_ENABLED; grounding rule: the model talks, TOOLS decide
 * every number (acceptance-criteria §D).
 */

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

/** One streaming completion call. Yields token deltas and collects tool calls. */
export async function* streamCompletion(
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<
  { type: 'token'; text: string } | { type: 'tool_calls'; calls: ToolCall[] } | { type: 'done' }
> {
  const base = process.env.DEEPSEEK_BASE_URL!.replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
      temperature: 0.3,
      // Cost cap — an unbounded completion can't run up the relay bill.
      max_tokens: 700,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`deepseek HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
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
        };
        const choice = json.choices?.[0];
        if (!choice) continue;
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
      } catch {
        // skip malformed frame
      }
    }
  }
  if (toolCalls.size > 0) yield { type: 'tool_calls', calls: [...toolCalls.values()] };
  yield { type: 'done' };
}
