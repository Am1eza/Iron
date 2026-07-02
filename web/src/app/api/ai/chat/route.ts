import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb } from '@/lib/server/utils/apiGuard';
import {
  aiEnabled,
  streamCompletion,
  type ChatMessage,
  type ToolCall,
} from '@/lib/server/integrations/deepseek';
import { AI_TOOLS, AI_SYSTEM_PROMPT, runTool } from '@/lib/server/services/aiTools';
import { reportError } from '@/lib/errors/report';

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

/**
 * POST /api/ai/chat — the server-side AI advisor (DeepSeek via the relay).
 * GROUNDING (acceptance-criteria §D): the model talks; TOOLS decide every
 * number (getPrice/calcWeight/estimateProject/createLead). SSE frames:
 * data: {type:'token'|'tool'|'lead'|'done'|'error', ...}
 */
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  if (!aiEnabled()) {
    return NextResponse.json(
      { error: 'ai_disabled', message: 'دستیار هوشمند موقتاً در دسترس نیست. از جدول قیمت‌ها و ابزارها استفاده کنید.' },
      { status: 503 },
    );
  }
  const guard = requireDb();
  if (guard) return guard;

  const body: unknown = await req.json().catch(() => null);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', message: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  const session = await getSession();
  const conversationId = parsed.data.conversationId;
  const messages: ChatMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      try {
        let rounds = 0;
        // Tool loop: stream tokens; on tool_calls execute + feed results back.
        for (;;) {
          let pendingCalls: ToolCall[] | null = null;
          for await (const ev of streamCompletion(messages, AI_TOOLS, req.signal)) {
            if (ev.type === 'token') send({ type: 'token', text: ev.text });
            else if (ev.type === 'tool_calls') pendingCalls = ev.calls;
          }
          if (!pendingCalls || rounds >= MAX_TOOL_ROUNDS) break;
          rounds++;

          messages.push({ role: 'assistant', content: null, tool_calls: pendingCalls });
          for (const call of pendingCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
            } catch {
              /* tolerate malformed args */
            }
            send({ type: 'tool', name: call.function.name });
            const result = await runTool(call.function.name, args, session, conversationId);
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
        send({ type: 'done' });
      } catch (err) {
        if (!req.signal.aborted) {
          reportError(err, { route: 'ai/chat' });
          send({ type: 'error', message: 'دستیار هوشمند با خطا مواجه شد. دوباره تلاش کنید.' });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}
