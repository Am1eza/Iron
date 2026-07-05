import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { aiEnabled } from '@/lib/server/integrations/deepseek';
import { numbersInText } from '@/lib/server/ai/grounding';
import { runAdvisorPipeline } from '@/lib/server/ai/pipeline';
import { buildChatMessages, ensureConversation, persistTurn } from '@/lib/server/ai/conversation';
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
 * number (getPrice/calcWeight/estimateProject/createLead) — the model⇄tools
 * loop + AC-D-3 validator gate live in `runAdvisorPipeline` (shared with the
 * eval harness); only sanitized text is streamed.
 * CONTINUITY: each request resolves/creates an ai_conversations row, announces
 * its id in a {type:'conversation'} frame, persists the turn, and injects the
 * rolling summary as a SECOND system message (AI_SYSTEM_PROMPT stays the
 * byte-identical first message — it is the DeepSeek cache prefix).
 * SSE frames: data: {type:'conversation'|'token'|'tool'|'lead'|'chips'|'done'|'error', ...}
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  // Anonymous access is deliberate (AI advisor is the funnel's "Magnet"
  // stage — the grounded tools never leak another user's data regardless of
  // session). Rate-limit instead of gating on auth: each request drives real
  // DeepSeek API cost across up to MAX_TOOL_ROUNDS.
  const limited = await rateLimit(req, 'ai-chat', { limit: 10, windowMs: 5 * 60_000 });
  if (limited) return limited;

  const body: unknown = await req.json().catch(() => null);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    // Match the app-wide validation envelope ({error:'validation', fields}).
    return NextResponse.json(
      { error: 'validation', message: 'درخواست نامعتبر است.', fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
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

  // AC-D-3 state: the user's own typed numbers (the tool ledger lives inside
  // the pipeline). Only whitelists numbers within the messages the client
  // actually sent (it trims to the last 10 turns for cost) — an older
  // user-stated figure falling out of that window can only cause
  // OVER-censoring of a later legitimate echo, never under-censoring, so the
  // safe direction is preserved.
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

      try {
        // Conversation continuity (best-effort — the chat works without it):
        // resolve/create the row up front and announce its id as the FIRST
        // frame so the client can echo it on later turns.
        let convId: string | undefined = conversationId;
        let summary: string | null = null;
        try {
          const conv = await ensureConversation(conversationId, session?.id ?? null);
          convId = conv.id;
          summary = conv.summary;
          send({ type: 'conversation', id: conv.id });
        } catch {
          /* persistence must never block the answer */
        }

        // AI_SYSTEM_PROMPT stays the byte-identical FIRST message (DeepSeek
        // cache prefix); the rolling summary rides AFTER it. GROUNDING: the
        // summary is context only — its numbers are never added to the
        // ledger or userNumbers, so it can't license new claims.
        const messages = buildChatMessages(parsed.data.messages, summary);

        const result = await runAdvisorPipeline({
          messages,
          userNumbers,
          session,
          conversationId: convId,
          clientMessages: parsed.data.messages,
          signal,
          send,
        });
        const { toolsUsed } = result;

        // Validated text streams in small frames (typewriter UX, few re-renders).
        for (let i = 0; i < result.text.length; i += 120) {
          send({ type: 'token', text: result.text.slice(i, i + 120) });
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

        // Deterministic id for THIS assistant answer, announced in `done` so the
        // client can attach 👍/👎 feedback to it (persisted below under the same id).
        const answerId = ulid();
        send({ type: 'done', messageId: answerId });

        // Turn persistence + rolling-summary refresh — fire-and-forget AFTER
        // the stream is complete; a failure can never break the answer.
        if (convId) {
          const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === 'user');
          void persistTurn(convId, lastUser?.content ?? null, result.text, undefined, answerId).catch(() => {
            /* persistence must never surface an error */
          });
        }

        // Usage telemetry — fire-and-forget AFTER the stream is complete, so
        // a slow/failed insert can never delay or break the user's answer.
        void getDb()
          .insert(aiUsage)
          .values({
            id: ulid(),
            conversationId: convId ?? null,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            cacheHitTokens: result.usage.cacheHitTokens,
            violations: result.violationsCaught,
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
