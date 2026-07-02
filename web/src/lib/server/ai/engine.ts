/**
 * The advisor engine — the agent loop behind /api/ai/chat.
 *
 * Flow per request:  trim history → (model ⇄ tools, ≤ MAX_TOOL_ROUNDS) →
 * buffer the final text → grounding validator (AC-D-3) → emit SSE events.
 *
 * Cost controls (deliberate, in order of impact):
 *  1. Byte-stable SYSTEM_PROMPT prefix → DeepSeek context-cache hits (~۱/۱۰ price).
 *  2. Hard history trim (last N turns, each capped) — old turns stop costing.
 *  3. Explicit max_tokens on every round; compact tool schemas/results.
 *  4. deepseek-chat (non-thinking) — the cheap tier is enough for tool routing.
 */
import { CONSTANTS } from '@/lib/config/constants';
import { GroundingLedger, numbersInText, sanitizeGrounded } from './grounding';
import { executeTool, TOOL_SCHEMAS, type ToolCard } from './tools';
import { SYSTEM_PROMPT } from './prompt';
import { complete, type ChatMessage, type RelayConfig } from './deepseek';

export type AdvisorEvent =
  | { type: 'delta'; text: string }
  | { type: 'card'; card: ToolCard }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ClientMessage {
  role: 'user' | 'ai';
  text: string;
}

export const FALLBACK_MESSAGE =
  'الان دستیار هوشمند در دسترس نیست. می‌توانی درخواستت را ثبت کنی تا کارشناس ما سریع تماس بگیرد، یا قیمت‌ها را مستقیم در جدول ببینی.';

/** Trim history so tokens (and cost) stay bounded; keep the newest turns. */
export function trimHistory(messages: ClientMessage[]): ChatMessage[] {
  return messages
    .slice(-CONSTANTS.AI_HISTORY_MAX_MESSAGES)
    .map((m) => ({
      role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
      content: m.text.slice(0, CONSTANTS.AI_MESSAGE_MAX_CHARS),
    }));
}

/**
 * Run one advisor turn. Emits events via `send`; never throws (all failures
 * become the graceful Persian fallback — AC-D-9).
 */
export async function runAdvisorTurn(
  cfg: RelayConfig,
  history: ClientMessage[],
  send: (e: AdvisorEvent) => void,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const ledger = new GroundingLedger();
  const userNumbers = new Set<number>();
  for (const m of history) if (m.role === 'user') numbersInText(m.text).forEach((n) => userNumbers.add(n));

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...trimHistory(history)];
  const cards: ToolCard[] = [];
  const timeout = AbortSignal.timeout(CONSTANTS.AI_TIMEOUT_MS);

  try {
    let final = '';
    for (let round = 0; ; round++) {
      const res = await complete(cfg, messages, {
        tools: TOOL_SCHEMAS,
        maxTokens: CONSTANTS.AI_MAX_TOKENS,
        signal: timeout,
        fetchImpl,
      });

      if (res.toolCalls.length === 0 || round >= CONSTANTS.AI_MAX_TOOL_ROUNDS) {
        final = res.content;
        break;
      }

      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls });
      for (const call of res.toolCalls) {
        const outcome = executeTool(call.function.name, call.function.arguments, ledger);
        if (outcome.card) cards.push(outcome.card);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome.result) });
      }
    }

    if (!final.trim()) {
      send({ type: 'error', message: FALLBACK_MESSAGE });
      return;
    }

    // AC-D-3 — the validator gate. One strict retry, then censor what's left.
    let checked = sanitizeGrounded(final, ledger, userNumbers);
    if (checked.violations.length > 0) {
      try {
        const retry = await complete(
          cfg,
          [
            ...messages,
            { role: 'assistant', content: final },
            {
              role: 'user',
              content:
                'پاسخ قبلی عددی داشت که از ابزارها نیامده بود. دوباره و فقط با اعداد خروجی ابزارها پاسخ بده؛ اگر عددی نداری، بگو کارشناس اعلام می‌کند.',
            },
          ],
          { tools: TOOL_SCHEMAS, maxTokens: CONSTANTS.AI_MAX_TOKENS, signal: timeout, fetchImpl },
        );
        if (retry.content.trim() && retry.toolCalls.length === 0) {
          checked = sanitizeGrounded(retry.content, ledger, userNumbers);
        }
      } catch {
        /* keep the censored first answer */
      }
    }

    // Buffered-then-chunked streaming: correctness first, then typewriter UX.
    for (const chunk of chunkText(checked.text)) send({ type: 'delta', text: chunk });
    for (const card of cards) send({ type: 'card', card });
    send({ type: 'done' });
  } catch {
    send({ type: 'error', message: FALLBACK_MESSAGE });
  }
}

/** Split validated text into small chunks so the client renders a live stream. */
export function chunkText(text: string, size = 24): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
