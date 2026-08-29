import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { aiEnabled, AiUnavailableError } from '@/lib/server/integrations/aiRelay';
import { budgetExhausted } from '@/lib/server/ai/budget';
import { upstreamUnavailable, noteSlowTimeout } from '@/lib/server/ai/upstreamState';
import { numbersInText } from '@/lib/server/ai/grounding';
import { runAdvisorPipeline } from '@/lib/server/ai/pipeline';
import { buildChatMessages, ensureConversation, identityFact, persistTurn } from '@/lib/server/ai/conversation';
import { getPromptVersions, resolvePromptText } from '@/lib/server/ai/promptVersions';
import { getDomainFacts } from '@/lib/server/ai/domainFacts';
import { isBareGreeting, GREETING_REPLY } from '@/lib/server/ai/greeting';
// The advisor's own user-facing copy (see ai/messages.ts): one register,
// one home, and testable, which a const inside a route file cannot be.
import { AI_UNAVAILABLE_MESSAGE, AI_ERROR_MESSAGE } from '@/lib/server/ai/messages';
import { selectFollowUpChips, PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
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

/** The AI_TIMEOUT_MS deadline firing, as opposed to a real failure. Matched by
 *  NAME, not identity: it is raised by `AbortSignal.timeout` inside the
 *  platform, and `AbortSignal.any` re-wraps it, so there is no constructor to
 *  compare against. `AbortError` is included because that is what the merged
 *  signal surfaces on some paths — the caller has already established that the
 *  USER did not abort (req.signal.aborted is false) before reaching here. */
function isDeadlineTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** 503 so AdvisorChat switches to the local grounded engine for the session
 *  (see its `e.status === 503` branch) instead of showing an error. */
function unavailable(): NextResponse {
  return NextResponse.json({ error: 'ai_unavailable', message: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
}

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
 * number (getPrice/calcWeight/estimateProject/prepareProforma) — the model⇄tools
 * loop + AC-D-3 validator gate live in `runAdvisorPipeline` (shared with the
 * eval harness); only sanitized text is streamed.
 * CONTINUITY: each request resolves/creates an ai_conversations row, announces
 * its id in a {type:'conversation'} frame, persists the turn, and injects the
 * rolling summary as a SECOND system message (AI_SYSTEM_PROMPT stays the
 * byte-identical first message — it is the relay's prompt-cache prefix).
 * GENERATIVE UI: tools also emit typed `block` frames (lib/ai/blocks.ts) — the
 * price quote, the factory comparison, the option chips, the trend chart —
 * built server-side from repo rows and rendered as real components. They ride
 * the same stream and, like `leadDraft`, are always on the wire BEFORE the
 * first `token`, so the client attaches them to the finished message.
 * SSE frames: data: {type:'conversation'|'token'|'tool'|'leadDraft'|'block'|'chips'|'done'|'error', ...}
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
    return unavailable();
  }
  const guard = requireDb();
  if (guard) return guard;

  // Both of these run BEFORE the stream opens, and both answer 503 with the
  // same envelope as `ai_disabled` — which the client already handles by
  // switching permanently to the local grounded engine for the session
  // (AdvisorChat: `e.status === 503 → useServer.current = false`). So the
  // visitor never sees a raw error and is never cut off mid-conversation:
  // they get an answer from the local engine and the human path, which is
  // what this business closes on anyway («اول مشورت، بعد خرید»).
  //
  // 1) The relay is already known to be refusing work (HTTP 402 credit
  //    exhausted, 401 revoked key, 429). Short-circuiting here is also what
  //    honours "never retry a 402": the first one costs a round trip, the
  //    rest of the cooldown costs none.
  const refusing = upstreamUnavailable();
  if (refusing) return unavailable();

  // 2) The daily token budget (audit area 29). `ai_usage` recorded tokens for
  //    months and nothing ever read them to enforce anything.
  if (await budgetExhausted()) return unavailable();

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
        // US-05.5 — [] whenever A/B isn't configured (fewer than 2 entries
        // in settings), so this whole path is a no-op for every deployment
        // that hasn't opted in.
        const promptVersions = await getPromptVersions().catch(() => []);
        let systemPrompt: string | undefined;
        try {
          const conv = await ensureConversation(conversationId, session?.id ?? null, promptVersions);
          convId = conv.id;
          summary = conv.summary;
          systemPrompt = resolvePromptText(conv.promptVersionId, promptVersions);
          send({ type: 'conversation', id: conv.id });
        } catch {
          /* persistence must never block the answer */
        }

        // The system prompt (baseline, or this conversation's A/B-assigned
        // version) stays the byte-identical FIRST message (DeepSeek cache
        // prefix); a stable non-numeric catalog overview rides right after
        // it (extends the cache), then the rolling summary. GROUNDING: both
        // are context only — no numbers, never added to the ledger/
        // userNumbers, so they can't license a claim.
        const domainFacts = await getDomainFacts().catch(() => '');
        const messages = buildChatMessages(
          parsed.data.messages,
          summary,
          domainFacts,
          systemPrompt,
          identityFact(session),
        );

        const result = await runAdvisorPipeline({
          messages,
          userNumbers,
          session,
          conversationId: convId,
          clientMessages: parsed.data.messages,
          signal,
          // Raw abort — separate from `signal` (merged with the AI_TIMEOUT_MS
          // deadline) so a shared-deadline timeout doesn't get mistaken for
          // "the user left" and wrongly skip the DeepSeek fallback (US-25.6).
          userSignal: req.signal,
          send,
        });
        const { toolsUsed } = result;

        // Validated text streams in small frames (typewriter UX, few re-renders).
        for (let i = 0; i < result.text.length; i += 120) {
          send({ type: 'token', text: result.text.slice(i, i + 120) });
        }

        // Contextual follow-up chips (AC-D-7) — see selectFollowUpChips above.
        const lastUserMessage = [...parsed.data.messages].reverse().find((m) => m.role === 'user')?.content?.trim();
        const userMessageCount = parsed.data.messages.filter((m) => m.role === 'user').length;
        const chips = selectFollowUpChips(
          toolsUsed,
          userMessageCount,
          lastUserMessage,
          // «کدام کارخانه؟» as buttons rather than a prose list the visitor
          // has to retype (audit proposal PR-C).
          result.choiceChips,
          // What the project estimate actually found — an itemised estimate
          // gets «همهٔ این اقلام را پیش‌فاکتور کن», not a generic weight tool.
          result.estimate,
        );
        if (chips.length > 0) send({ type: 'chips', chips });

        // Deterministic id for THIS assistant answer, announced in `done` so the
        // client can attach 👍/👎 feedback to it (persisted below under the same id).
        const answerId = ulid();
        send({ type: 'done', messageId: answerId });

        // Turn persistence + rolling-summary refresh — fire-and-forget AFTER
        // the stream is complete; a failure can never break the answer.
        // An empty answer means the pipeline threw the turn away (a leaked
        // scratchpad — see answerGuard.ts). Persisting it would feed the
        // rolling summary a turn where the advisor said nothing.
        if (convId && result.text.trim()) {
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
            // What each post-processor removed, and whether it left nothing
            // (ai/pipeline.ts#AnswerTrace). This row is written even when the
            // answer is empty — which is the whole point, since the empty
            // ones are exactly the turns `ai_messages` above skips.
            answerTrace: result.trace,
          })
          .catch(() => {
            /* telemetry must never surface an error */
          });

        // A guard that is supposed to remove a sentence removed the ANSWER.
        // Both of these are removal-only and additive-claim-scoped, so this
        // should be unreachable; if it ever is reached, it is the case that
        // must not sit in a table waiting to be queried. Reported at most as
        // often as it happens, which by construction is approximately never.
        if (result.trace.emptyAt === 'claims' || result.trace.emptyAt === 'repeat') {
          reportError(new Error(`ai answer emptied by ${result.trace.emptyAt} guard`), {
            route: 'ai/chat',
            reason: 'guard_emptied_answer',
            ...result.trace,
          });
        }
      } catch (err) {
        if (!req.signal.aborted) {
          // An upstream refusal is NOT an application error: it is already
          // classified and reported once per state transition inside the
          // AI relay client, so reporting it again here would restore exactly
          // the per-request noise this removes. The user gets the human-path
          // message; the client falls back to the local grounded engine.
          if (err instanceof AiUnavailableError) {
            send({ type: 'error', message: AI_UNAVAILABLE_MESSAGE });
          } else if (isDeadlineTimeout(err)) {
            // The relay is UP — this one answer just ran past the deadline.
            // The current model's latency is wildly variable (6.8s / 48.8s /
            // 6.7s on three identical measured requests), so this is a normal
            // tail event, not an outage: the user gets the human path and the
            // client falls back to the local grounded engine, and the operator
            // hears about it at most once every ten minutes rather than once
            // per request. Deliberately NOT routed through the upstream
            // cooldown — one slow answer must not take the advisor away from
            // everyone else.
            if (noteSlowTimeout()) {
              reportError(err, { route: 'ai/chat', reason: 'deadline_timeout', budgetMs: CONSTANTS.AI_TIMEOUT_MS });
            }
            send({ type: 'error', message: AI_UNAVAILABLE_MESSAGE });
          } else {
            reportError(err, { route: 'ai/chat' });
            send({ type: 'error', message: AI_ERROR_MESSAGE });
          }
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
