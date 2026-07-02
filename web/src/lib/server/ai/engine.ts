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
  | { type: 'chips'; chips: string[] }
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

  const toolsUsed = new Set<string>();
  try {
    let final = '';
    for (let round = 0; ; round++) {
      // Past the round cap, tools are withheld so the model MUST answer with
      // what it already gathered — never an empty reply, never an endless loop.
      const allowTools = round < CONSTANTS.AI_MAX_TOOL_ROUNDS;
      const res = await complete(cfg, messages, {
        tools: allowTools ? TOOL_SCHEMAS : undefined,
        maxTokens: CONSTANTS.AI_MAX_TOKENS,
        signal: timeout,
        fetchImpl,
      });

      if (res.toolCalls.length === 0 || !allowTools) {
        final = res.content;
        break;
      }

      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls });
      for (const call of res.toolCalls) {
        const outcome = executeTool(call.function.name, call.function.arguments, ledger);
        toolsUsed.add(call.function.name);
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
    const chips = suggestChips(toolsUsed, history);
    if (chips.length > 0) send({ type: 'chips', chips });
    send({ type: 'done' });
  } catch {
    send({ type: 'error', message: FALLBACK_MESSAGE });
  }
}

/**
 * Contextual follow-up chips (AC-D-7) — deterministic, derived from which tools
 * ran this turn: zero extra model tokens, always-relevant next steps.
 */
export function suggestChips(toolsUsed: ReadonlySet<string>, history: ClientMessage[]): string[] {
  if (toolsUsed.has('estimate_project') || toolsUsed.has('compare_factories'))
    return ['دریافت پیش‌فاکتور', 'وزن دقیق را حساب کن'];
  if (toolsUsed.has('get_prices') || toolsUsed.has('calc_weight'))
    return ['دریافت پیش‌فاکتور', 'همهٔ قیمت‌ها'];
  // No tools ran → the model asked a clarifying question; on the opening turn
  // offer the purpose quick-replies so the intent-first ask is one tap.
  const userTurns = history.filter((m) => m.role === 'user').length;
  return userTurns <= 1
    ? ['ساختمان مسکونی', 'سوله یا سازهٔ صنعتی', 'بازرگانی و فروش', 'فقط می‌خواهم قیمت ببینم']
    : [];
}

/** Split validated text into small chunks so the client renders a live stream. */
export function chunkText(text: string, size = 24): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
