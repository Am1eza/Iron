/**
 * The AI advisor's model⇄tools pipeline — extracted from /api/ai/chat so the
 * eval harness (evals.test.ts) can drive the REAL production loop with a
 * scripted relay. Behavior is identical to the route's original inline loop:
 *
 * GROUNDING (acceptance-criteria §D): the model talks; TOOLS decide every
 * number — and a post-generation validator (AC-D-3) gates the text: each
 * completion round is BUFFERED, every number checked against the tool ledger
 * + the user's own inputs, and only sanitized text leaves the pipeline. One
 * correction round (which may call tools — the legitimate recovery) runs
 * before censorship wins.
 */
import type { AuthUser } from '@/lib/auth/types';
import {
  streamCompletion,
  type ChatMessage,
  type ToolCall,
} from '@/lib/server/integrations/deepseek';
import { AI_TOOLS, runTool } from '@/lib/server/services/aiTools';
import { GroundingLedger, sanitizeGrounded } from './grounding';

export const MAX_TOOL_ROUNDS = 4;

/** Test seam: the eval harness injects a scripted generator with this shape. */
export type StreamCompletionFn = typeof streamCompletion;

export interface PipelineOptions {
  /** Full relay message list (system prompt first); MUTATED as tool rounds append. */
  messages: ChatMessage[];
  /** The user's own typed numbers — their inputs are never "invented". */
  userNumbers: ReadonlySet<number>;
  session: AuthUser | null;
  conversationId?: string;
  /** The validated client transcript — rides into createLead for sales. */
  clientMessages?: Array<{ role: string; content: string }>;
  signal?: AbortSignal;
  /** The raw user/request abort, separate from `signal` (which may be a
   *  merged request-deadline signal) — threaded down to fetchCompletion so a
   *  shared-deadline timeout doesn't get mistaken for "the user left" and
   *  wrongly skip the fallback relay (US-25.6). Optional: omitting it just
   *  reproduces the old behavior. */
  userSignal?: AbortSignal;
  /** SSE frame emitter ('tool'/'lead' progress frames); omit for tests. */
  send?: (frame: Record<string, unknown>) => void;
  /** Injected relay (defaults to the real DeepSeek stream). */
  stream?: StreamCompletionFn;
}

export interface PipelineResult {
  /** The sanitized final text — nothing unvalidated ever leaves the pipeline. */
  text: string;
  /** FIRST pass's violation count: a clean retry still means the model tried. */
  violationsCaught: number;
  toolsUsed: Set<string>;
  usage: { promptTokens: number; completionTokens: number; cacheHitTokens: number };
  /** Exposed so callers/tests can re-verify the final text independently. */
  ledger: GroundingLedger;
}

export async function runAdvisorPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { messages, userNumbers, session, conversationId, clientMessages, signal, userSignal } = opts;
  const stream = opts.stream ?? streamCompletion;
  const send = opts.send ?? (() => {});

  // AC-D-3 state: every tool-returned number becomes quotable.
  const ledger = new GroundingLedger();
  const toolsUsed = new Set<string>();

  // createLead sends a real SMS per call and, unlike POST /api/leads, isn't
  // gated by that route's own rate limiter — it's invoked here as a plain
  // service function. DeepSeek can request several tool calls per round
  // across up to MAX_TOOL_ROUNDS (plus a correction retry), so without a cap
  // a single ai-chat request could be steered into an SMS-bombing run
  // against arbitrary numbers. Scoped OUTSIDE runLoop so the cap holds
  // across the correction-retry call too — one lead per conversation covers
  // the real use case (a visitor's own proforma).
  let leadCalls = 0;
  const MAX_LEAD_CALLS = 1;

  // Token cost accumulated across ALL completion rounds (tool rounds + the
  // correction retry) — one aiUsage row per request.
  const usage = { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };

  // US-27.5: the relay hit max_tokens mid-answer (finish_reason:'length') —
  // ask it to continue ONCE rather than hand the user a sentence cut off
  // mid-word. Scoped OUTSIDE runLoop (like MAX_LEAD_CALLS) so the cap holds
  // across the correction-retry call too — a truncation-prone answer could
  // otherwise burn a continuation on every runLoop invocation.
  let continuedOnce = false;
  async function continueTruncatedAnswer(partial: string): Promise<string> {
    messages.push(
      { role: 'assistant', content: partial },
      {
        role: 'user',
        content:
          '[یادداشت داخلی سیستم — این را کاربر ننوشته و کاربر آن را نمی‌بیند]: پاسخ قبلی به‌خاطر محدودیت طول مدل وسط جمله قطع شد. دقیقاً از همان نقطه که قطع شده ادامه بده — متن قبلی را تکرار نکن و به این یادداشت یا به قطع‌شدن اشاره‌ای نکن.',
      },
    );
    let extra = '';
    try {
      // Tools withheld — this call's only job is finishing the sentence.
      for await (const ev of stream(messages, [], signal, userSignal)) {
        if (ev.type === 'token') extra += ev.text;
        else if (ev.type === 'usage') {
          usage.promptTokens += ev.usage.promptTokens;
          usage.completionTokens += ev.usage.completionTokens;
          usage.cacheHitTokens += ev.usage.cacheHitTokens;
        }
      }
    } catch {
      /* keep the truncated-but-present partial answer rather than failing the whole request */
    }
    return partial + extra;
  }

  /** One model⇄tools loop; returns the buffered final text (never streamed raw).
   *  On the last allowed round tools are WITHHELD so the model must answer
   *  with what it already has — otherwise a model that keeps requesting
   *  tools past the cap would silently return an empty final answer. */
  const runLoop = async (maxRounds: number): Promise<string> => {
    for (let round = 0; ; round++) {
      const allowTools = round < maxRounds;
      let pendingCalls: ToolCall[] | null = null;
      let buffered = '';
      let truncated = false;
      for await (const ev of stream(messages, allowTools ? AI_TOOLS : [], signal, userSignal)) {
        if (ev.type === 'token') buffered += ev.text;
        else if (ev.type === 'tool_calls') pendingCalls = ev.calls;
        else if (ev.type === 'truncated') truncated = true;
        else if (ev.type === 'usage') {
          // Server-side telemetry only — never forwarded to the client.
          usage.promptTokens += ev.usage.promptTokens;
          usage.completionTokens += ev.usage.completionTokens;
          usage.cacheHitTokens += ev.usage.cacheHitTokens;
        }
      }
      if (!pendingCalls || !allowTools) {
        // Only the FINAL answering round's truncation matters — an
        // intermediate tool-round's `buffered` text is discarded below
        // regardless (only `pendingCalls` is used once tools were called).
        if (truncated && !continuedOnce && buffered.trim()) {
          continuedOnce = true;
          buffered = await continueTruncatedAnswer(buffered);
        }
        return buffered;
      }

      messages.push({ role: 'assistant', content: null, tool_calls: pendingCalls });
      for (const call of pendingCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          /* tolerate malformed args */
        }
        send({ type: 'tool', name: call.function.name });
        let result: unknown;
        if (call.function.name === 'createLead' && leadCalls >= MAX_LEAD_CALLS) {
          result = { error: 'در هر گفتگو فقط یک درخواست ثبت می‌شود. برای مورد بعدی با کارشناس تماس بگیرید.' };
        } else {
          // The validated request messages ride along so createLead can
          // persist the chat transcript into the lead for sales.
          result = await runTool(call.function.name, args, session, conversationId, clientMessages);
          if (call.function.name === 'createLead') leadCalls++;
        }
        toolsUsed.add(call.function.name);
        ledger.addFromJson(result); // every tool number becomes quotable
        if (call.function.name === 'createLead' && result && typeof result === 'object' && 'ref' in result) {
          send({ type: 'lead', ...(result as Record<string, unknown>) });
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
  };

  const final = await runLoop(MAX_TOOL_ROUNDS);

  // The validator gate — nothing unvalidated ever reaches the user.
  let checked = sanitizeGrounded(final, ledger, userNumbers);
  // Telemetry keeps the FIRST pass's count: a clean retry still means
  // the model tried to invent numbers this request.
  const violationsCaught = checked.violations.length;
  if (checked.violations.length > 0 && !signal?.aborted) {
    try {
      messages.push(
        { role: 'assistant', content: final },
        {
          // Framed explicitly as a SYSTEM correction, not the user
          // speaking — otherwise the model replies AS IF the user had
          // just pointed out its mistake ("شما درست می‌فرمایید…"),
          // which is confusing since the real user never said that.
          role: 'user',
          content:
            '[یادداشت داخلی سیستم — این را کاربر ننوشته و کاربر آن را نمی‌بیند]: پاسخ قبلی عددی داشت که از خروجی ابزارها نیامده بود. اگر لازم است دوباره ابزار را صدا بزن و فقط با اعداد خروجی ابزارها پاسخ بده؛ اگر عددی نداری، بگو کارشناس اعلام می‌کند. مستقیماً پاسخ نهایی و طبیعی را برای کاربر بنویس — به این یادداشت، به اشتباه قبلی، یا به فرایند اصلاح هیچ اشاره‌ای نکن.',
        },
      );
      const retry = await runLoop(2);
      if (retry.trim()) {
        const retryChecked = sanitizeGrounded(retry, ledger, userNumbers);
        if (retryChecked.violations.length === 0) checked = retryChecked;
      }
    } catch {
      /* keep the censored first answer */
    }
  }

  return { text: checked.text, violationsCaught, toolsUsed, usage, ledger };
}
