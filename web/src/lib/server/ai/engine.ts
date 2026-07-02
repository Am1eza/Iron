/**
 * The advisor engine — the agent loop behind /api/ai/chat.
 *
 * Flow per request:  trim history → (model ⇄ tools, ≤ MAX_TOOL_ROUNDS) →
 * buffer the final text → grounding validator (AC-D-3) → emit SSE events.
 * On a violation the correction round may call tools again (the model's
 * legitimate recovery path); if it still misbehaves, censorship wins.
 *
 * Cost controls (deliberate, in order of impact):
 *  1. Byte-stable SYSTEM_PROMPT prefix → DeepSeek context-cache hits (~۱/۱۰ price).
 *  2. Hard history trim (last N turns, each capped) — old turns stop costing.
 *  3. Explicit max_tokens on every round; compact tool schemas/results.
 *  4. deepseek-chat (non-thinking) — the cheap tier is enough for tool routing.
 *  5. Client-disconnect aborts in-flight relay rounds (no tokens for closed tabs).
 */
import { CONSTANTS } from '@/lib/config/constants';
import { CHIP, PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
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

interface TurnState {
  cfg: RelayConfig;
  messages: ChatMessage[];
  ledger: GroundingLedger;
  cards: ToolCard[];
  toolsUsed: Set<string>;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** model ⇄ tools until a plain answer (or the round budget forces one). */
async function runLoop(s: TurnState, maxRounds: number): Promise<string> {
  for (let round = 0; ; round++) {
    // Past the cap, tools are withheld so the model MUST answer with what it
    // already gathered — an empty reply / endless loop is impossible.
    const allowTools = round < maxRounds;
    const res = await complete(s.cfg, s.messages, {
      tools: allowTools ? TOOL_SCHEMAS : undefined,
      maxTokens: CONSTANTS.AI_MAX_TOKENS,
      signal: s.signal,
      fetchImpl: s.fetchImpl,
    });
    if (res.toolCalls.length === 0 || !allowTools) return res.content;

    s.messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      const outcome = executeTool(call.function.name, call.function.arguments, s.ledger);
      s.toolsUsed.add(call.function.name);
      if (outcome.card) s.cards.push(outcome.card);
      s.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome.result) });
    }
  }
}

/**
 * Run one advisor turn. Emits events via `send`; never throws (all failures
 * become the graceful Persian fallback — AC-D-9). `clientSignal` (the request's
 * abort signal) stops paid relay work the moment the user disconnects.
 */
export async function runAdvisorTurn(
  cfg: RelayConfig,
  history: ClientMessage[],
  send: (e: AdvisorEvent) => void,
  fetchImpl?: typeof fetch,
  clientSignal?: AbortSignal,
): Promise<void> {
  const ledger = new GroundingLedger();
  const userNumbers = new Set<number>();
  for (const m of history) if (m.role === 'user') numbersInText(m.text).forEach((n) => userNumbers.add(n));

  const timeout = AbortSignal.timeout(CONSTANTS.AI_TIMEOUT_MS);
  const signal =
    clientSignal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([timeout, clientSignal])
      : timeout;

  const state: TurnState = {
    cfg,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimHistory(history)],
    ledger,
    cards: [],
    toolsUsed: new Set(),
    signal,
    fetchImpl,
  };

  try {
    const final = await runLoop(state, CONSTANTS.AI_MAX_TOOL_ROUNDS);
    if (!final.trim()) {
      send({ type: 'error', message: FALLBACK_MESSAGE });
      return;
    }

    // AC-D-3 — the validator gate. The correction round keeps tool access (the
    // right recovery is often «call get_prices now»); then censorship wins.
    let checked = sanitizeGrounded(final, ledger, userNumbers);
    if (checked.violations.length > 0) {
      try {
        state.messages.push(
          { role: 'assistant', content: final },
          {
            role: 'user',
            content:
              'پاسخ قبلی عددی داشت که از ابزارها نیامده بود. اگر لازم است ابزار را صدا بزن و دوباره فقط با اعداد خروجی ابزارها پاسخ بده؛ اگر عددی نداری، بگو کارشناس اعلام می‌کند.',
          },
        );
        const retryFinal = await runLoop(state, 2);
        if (retryFinal.trim()) {
          const retryChecked = sanitizeGrounded(retryFinal, ledger, userNumbers);
          // Prefer the retry only if it is actually cleaner.
          if (retryChecked.violations.length === 0) checked = retryChecked;
        }
      } catch {
        /* keep the censored first answer */
      }
    }

    // Buffered-then-chunked streaming: correctness first, then typewriter UX.
    for (const chunk of chunkText(checked.text)) send({ type: 'delta', text: chunk });
    for (const card of state.cards) send({ type: 'card', card });
    const chips = suggestChips(state.toolsUsed, history);
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
    return [CHIP.proforma, CHIP.weighTool];
  if (toolsUsed.has('get_prices') || toolsUsed.has('calc_weight'))
    return [CHIP.proforma, CHIP.allPrices];
  // No tools ran → the model asked a clarifying question; on the opening turn
  // offer the purpose quick-replies so the intent-first ask is one tap.
  const userTurns = history.filter((m) => m.role === 'user').length;
  return userTurns <= 1 ? [...PURPOSE_CHIPS] : [];
}

/** Split validated text into a few SSE frames — enough for a live feel without
 *  dozens of client re-renders per answer. */
export function chunkText(text: string, size = 120): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
