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
} from '@/lib/server/integrations/aiRelay';
import { AI_TOOLS, runTool } from '@/lib/server/services/aiTools';
import { GroundingLedger, sanitizeGrounded } from './grounding';
import { collapseImmediateRepeat, looksLikeLeakedReasoning } from './answerGuard';
import { toInformalSecondPerson } from './informalVoice';

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
  /** Injected relay (defaults to the real streamCompletion relay). */
  stream?: StreamCompletionFn;
}

export interface PipelineResult {
  /** The sanitized final text — nothing unvalidated ever leaves the pipeline. */
  text: string;
  /** FIRST pass's violation count: a clean retry still means the model tried. */
  violationsCaught: number;
  /**
   * The options of a `needs_choice` the turn ended on — «کدام کارخانه؟» as
   * tappable chips instead of a prose list the visitor has to retype (the
   * route hands them to selectFollowUpChips). Empty unless the LAST
   * prepareProforma of the turn came back ambiguous: a draft that resolved
   * afterwards means the question is answered and the confirmation card is
   * the next step.
   */
  choiceChips: string[];
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
  // Options from the turn's last unresolved prepareProforma (see
  // PipelineResult.choiceChips). Reset by a later resolved draft so a stale
  // «کدام کارخانه؟» row can never outlive its own question.
  let choiceChips: string[] = [];

  // prepareProforma no longer files a lead (no SMS until the visitor presses
  // the confirm button — see ai/leadDraft.ts), but it does price every line
  // against the catalog, and the relay can request several tool calls per
  // round across MAX_TOOL_ROUNDS plus a correction retry. Cap it so one
  // ai-chat request can't be steered into an unbounded pricing loop, and so
  // the visitor is never shown a stack of competing confirmation cards.
  // Scoped OUTSIDE runLoop so the cap holds across the correction retry too.
  let draftCalls = 0;
  const MAX_DRAFT_CALLS = 2;

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
          '[یادداشت داخلی سیستم؛ این را کاربر ننوشته و کاربر آن را نمی‌بیند]: پاسخ قبلی به‌خاطر محدودیت طول مدل وسط جمله قطع شد. دقیقاً از همان نقطه که قطع شده ادامه بده، متن قبلی را تکرار نکن و به این یادداشت یا به قطع‌شدن اشاره‌ای نکن.',
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
        if (call.function.name === 'prepareProforma' && draftCalls >= MAX_DRAFT_CALLS) {
          result = { error: 'خلاصهٔ درخواست همین حالا به کاربر نشان داده شده؛ فقط بگو آن را تأیید کند.' };
        } else {
          // The validated request messages ride along so the draft carries the
          // chat transcript into the lead for sales on confirm.
          result = await runTool(call.function.name, args, session, conversationId, clientMessages, (draft) =>
            // The confirmation card — emitted DURING tool execution, i.e.
            // strictly before this turn's text, exactly like the old `lead`
            // frame, so the client can attach it to the committed message.
            send({ type: 'leadDraft', ...draft }),
          );
          if (call.function.name === 'prepareProforma') {
            draftCalls++;
            // The tool decides WHETHER a choice is chip-able (one ambiguous
            // line, deduped, capped — see chipsForChoice); the pipeline only
            // carries the answer out to the route.
            const choice = (result as { status?: string; choiceChips?: unknown })?.status === 'needs_choice'
              ? (result as { choiceChips?: unknown }).choiceChips
              : [];
            choiceChips = Array.isArray(choice) ? choice.filter((c): c is string => typeof c === 'string') : [];
          }
        }
        toolsUsed.add(call.function.name);
        ledger.addFromJson(result); // every tool number becomes quotable
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
            '[یادداشت داخلی سیستم؛ این را کاربر ننوشته و کاربر آن را نمی‌بیند]: پاسخ قبلی عددی داشت که از خروجی ابزارها نیامده بود. اگر لازم است دوباره ابزار را صدا بزن و فقط با اعداد خروجی ابزارها پاسخ بده؛ اگر عددی نداری، بگو کارشناس اعلام می‌کند. مستقیماً پاسخ نهایی و طبیعی را برای کاربر بنویس؛ به این یادداشت، به اشتباه قبلی، یا به فرایند اصلاح هیچ اشاره‌ای نکن.',
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

  // The model thinking out loud instead of answering (see answerGuard.ts —
  // this shipped to a real visitor as 60 lines of English deliberation about
  // the advisor's own rules). Ask once for the final answer only; if it still
  // comes back as a scratchpad, return NOTHING, which the route turns into
  // the honest «موقتاً در دسترس نیست» notice with its retry. An empty answer
  // is recoverable; a leaked one cannot be taken back.
  if (looksLikeLeakedReasoning(checked.text) && !signal?.aborted) {
    try {
      messages.push(
        { role: 'assistant', content: checked.text },
        {
          role: 'user',
          content:
            '[یادداشت داخلی سیستم؛ این را کاربر ننوشته و کاربر آن را نمی‌بیند]: پاسخ قبلی به‌جای جواب، فرایند فکر کردن تو بود و به فارسی هم نبود. فقط و فقط متن نهایی پاسخ را به فارسی بنویس؛ هیچ توضیحی دربارهٔ قواعد، ابزارها یا روند تصمیم‌گیری‌ات ننویس و به این یادداشت اشاره نکن.',
        },
      );
      const retry = await runLoop(1);
      checked = looksLikeLeakedReasoning(retry)
        ? { text: '', violations: [] }
        : sanitizeGrounded(retry, ledger, userNumbers);
    } catch {
      checked = { text: '', violations: [] };
    }
  }

  // Register safety net, LAST: the prompt asks for تو in four places and this
  // model still answers «می‌بینید … هستید … می‌خواهید» on some turns. Only the
  // forms where plural→singular is pure morphology are rewritten (see
  // informalVoice.ts); grammar changes, content does not, so it cannot move a
  // number past the validator that already ran above.
  //
  // The stutter collapse runs AFTER the register rewrite, not before: the
  // rewrite can itself make two neighbouring clauses identical («می‌خواهید»
  // then «می‌خواهی» both become «می‌خواهی»), so this is the only order that
  // catches that case too. Removal-only — see answerGuard.
  return {
    text: collapseImmediateRepeat(toInformalSecondPerson(checked.text)),
    violationsCaught,
    choiceChips,
    toolsUsed,
    usage,
    ledger,
  };
}
