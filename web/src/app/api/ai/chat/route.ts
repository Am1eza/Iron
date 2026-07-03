import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import {
  aiEnabled,
  streamCompletion,
  type ChatMessage,
  type ToolCall,
} from '@/lib/server/integrations/deepseek';
import { AI_TOOLS, AI_SYSTEM_PROMPT, runTool } from '@/lib/server/services/aiTools';
import {
  GroundingLedger,
  numbersInText,
  sanitizeGrounded,
} from '@/lib/server/ai/grounding';
import { isBareGreeting, GREETING_REPLY } from '@/lib/server/ai/greeting';
import { CHIP, PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
import { reportError } from '@/lib/errors/report';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { CONSTANTS } from '@/lib/config/constants';
import { getDb } from '@/lib/server/db/client';
import { aiUsage } from '@/lib/server/db/schema';
import { ulid } from 'ulid';

export const runtime = 'nodejs';

const payload = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(40),
  conversationId: z.string().max(64).optional(),
});

const MAX_TOOL_ROUNDS = 4;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  Connection: 'keep-alive',
} as const;

/** The canned greeting stream — same frame protocol as the model path
 *  (token/chips/done) so the client renders it identically. */
function sseGreetingResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      for (let i = 0; i < GREETING_REPLY.length; i += 120) {
        send({ type: 'token', text: GREETING_REPLY.slice(i, i + 120) });
      }
      send({ type: 'chips', chips: [...PURPOSE_CHIPS] });
      send({ type: 'done' });
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * POST /api/ai/chat — the server-side AI advisor (DeepSeek via the relay).
 * GROUNDING (acceptance-criteria §D): the model talks; TOOLS decide every
 * number (getPrice/calcWeight/estimateProject/createLead) — and a
 * post-generation validator (AC-D-3) gates the text: each completion round is
 * BUFFERED, every number checked against the tool ledger + the user's own
 * inputs, and only sanitized text is streamed. One correction round (which may
 * call tools — the legitimate recovery) runs before censorship wins.
 * SSE frames: data: {type:'token'|'tool'|'lead'|'chips'|'done'|'error', ...}
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  // Anonymous access is deliberate (AI advisor is the funnel's "Magnet"
  // stage — the grounded tools never leak another user's data regardless of
  // session). Rate-limit instead of gating on auth: each request drives real
  // DeepSeek API cost across up to MAX_TOOL_ROUNDS.
  const limited = rateLimit(req, 'ai-chat', { limit: 10, windowMs: 5 * 60_000 });
  if (limited) return limited;

  const body: unknown = await req.json().catch(() => null);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', message: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  // Bare-greeting short-circuit: an opening «سلام» gets the canned intro +
  // purpose chips at zero cost — no relay round, no DB read. Checked BEFORE
  // aiEnabled/requireDb so it works even while the relay is switched off.
  const userMessages = parsed.data.messages.filter((m) => m.role === 'user');
  if (userMessages.length === 1 && isBareGreeting(userMessages[0]!.content)) {
    return sseGreetingResponse();
  }

  if (!aiEnabled()) {
    return NextResponse.json(
      { error: 'ai_disabled', message: 'دستیار هوشمند موقتاً در دسترس نیست. از جدول قیمت‌ها و ابزارها استفاده کنید.' },
      { status: 503 },
    );
  }
  const guard = requireDb();
  if (guard) return guard;

  const session = await getSession();
  const conversationId = parsed.data.conversationId;
  const messages: ChatMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // AC-D-3 state: every tool-returned number + the user's own typed numbers.
  // Only whitelists numbers within the messages the client actually sent (it
  // trims to the last 10 turns for cost) — an older user-stated figure falling
  // out of that window can only cause OVER-censoring of a later legitimate
  // echo, never under-censoring, so the safe direction is preserved.
  const ledger = new GroundingLedger();
  const userNumbers = new Set<number>();
  for (const m of parsed.data.messages)
    if (m.role === 'user') numbersInText(m.content).forEach((n) => userNumbers.add(n));

  // AC-D-9: never hang past AI_TIMEOUT_MS; user disconnect also stops paid work.
  const timeout = AbortSignal.timeout(CONSTANTS.AI_TIMEOUT_MS);
  const signal =
    typeof AbortSignal.any === 'function' ? AbortSignal.any([req.signal, timeout]) : timeout;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      // A cancelled stream (closed tab) makes enqueue throw — swallow so
      // teardown stays clean; req.signal already stops the relay stream.
      const send = (frame: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const toolsUsed = new Set<string>();
      // createLead sends a real SMS per call and, unlike POST /api/leads,
      // isn't gated by that route's own rate limiter — it's invoked here as a
      // plain service function. DeepSeek can request several tool calls per
      // round across up to MAX_TOOL_ROUNDS (plus a correction retry), so
      // without a cap a single ai-chat request could be steered into an
      // SMS-bombing run against arbitrary numbers. Scoped OUTSIDE runLoop so
      // the cap holds across the correction-retry call too — one lead per
      // conversation covers the real use case (a visitor's own proforma).
      let leadCalls = 0;
      const MAX_LEAD_CALLS = 1;

      // Token cost accumulated across ALL completion rounds (tool rounds +
      // the correction retry) — one aiUsage row per request.
      const usageTotals = { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };

      /** One model⇄tools loop; returns the buffered final text (never streamed raw).
       *  On the last allowed round tools are WITHHELD so the model must answer
       *  with what it already has — otherwise a model that keeps requesting
       *  tools past the cap would silently return an empty final answer. */
      const runLoop = async (maxRounds: number): Promise<string> => {
        for (let round = 0; ; round++) {
          const allowTools = round < maxRounds;
          let pendingCalls: ToolCall[] | null = null;
          let buffered = '';
          for await (const ev of streamCompletion(messages, allowTools ? AI_TOOLS : [], signal)) {
            if (ev.type === 'token') buffered += ev.text;
            else if (ev.type === 'tool_calls') pendingCalls = ev.calls;
            else if (ev.type === 'usage') {
              // Server-side telemetry only — never forwarded to the client.
              usageTotals.promptTokens += ev.usage.promptTokens;
              usageTotals.completionTokens += ev.usage.completionTokens;
              usageTotals.cacheHitTokens += ev.usage.cacheHitTokens;
            }
          }
          if (!pendingCalls || !allowTools) return buffered;

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
              result = await runTool(call.function.name, args, session, conversationId, parsed.data.messages);
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

      try {
        const final = await runLoop(MAX_TOOL_ROUNDS);

        // The validator gate — nothing unvalidated ever reaches the user.
        let checked = sanitizeGrounded(final, ledger, userNumbers);
        // Telemetry keeps the FIRST pass's count: a clean retry still means
        // the model tried to invent numbers this request.
        const violationsCaught = checked.violations.length;
        if (checked.violations.length > 0 && !signal.aborted) {
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

        // Validated text streams in small frames (typewriter UX, few re-renders).
        for (let i = 0; i < checked.text.length; i += 120) {
          send({ type: 'token', text: checked.text.slice(i, i + 120) });
        }

        // Contextual follow-up chips (AC-D-7) — deterministic, zero model tokens.
        const chips =
          toolsUsed.has('estimateProject') || toolsUsed.has('createLead')
            ? [CHIP.proforma, CHIP.weighTool]
            : toolsUsed.has('getPrice') || toolsUsed.has('calcWeight')
              ? [CHIP.proforma, CHIP.allPrices]
              : parsed.data.messages.filter((m) => m.role === 'user').length <= 1
                ? [...PURPOSE_CHIPS]
                : [];
        if (chips.length > 0) send({ type: 'chips', chips });

        send({ type: 'done' });

        // Usage telemetry — fire-and-forget AFTER the stream is complete, so
        // a slow/failed insert can never delay or break the user's answer.
        void getDb()
          .insert(aiUsage)
          .values({
            id: ulid(),
            conversationId: conversationId ?? null,
            promptTokens: usageTotals.promptTokens,
            completionTokens: usageTotals.completionTokens,
            cacheHitTokens: usageTotals.cacheHitTokens,
            violations: violationsCaught,
          })
          .catch(() => {
            /* telemetry must never surface an error */
          });
      } catch (err) {
        if (!req.signal.aborted) {
          reportError(err, { route: 'ai/chat' });
          send({ type: 'error', message: 'دستیار هوشمند با خطا مواجه شد. دوباره تلاش کنید.' });
        }
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already cancelled */
          }
        }
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export const POST = withApiErrorHandling(POSTImpl);
