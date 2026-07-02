import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { aiChatPayload } from '@/lib/validation/api';
import { CONSTANTS } from '@/lib/config/constants';
import { getRelayConfig } from '@/lib/server/ai/deepseek';
import { runAdvisorTurn, type AdvisorEvent } from '@/lib/server/ai/engine';

/**
 * POST /api/ai/chat — the grounded AI advisor (DeepSeek via the out-of-Iran
 * relay). Streams SSE events: delta | card | done | error. Every number in the
 * reply passed the grounding validator server-side (acceptance-criteria §D).
 */

/* Best-effort per-isolate rate limit (cost guard). A durable/KV limiter can
 * replace this in the backend layer; even per-isolate it caps abuse loops. */
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - CONSTANTS.AI_RATE_LIMIT_WINDOW_MS;
  const list = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (list.length >= CONSTANTS.AI_RATE_LIMIT_MAX) return true;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear(); // unbounded-growth guard
  return false;
}

const sse = (e: AdvisorEvent) => `data: ${JSON.stringify(e)}\n\n`;

export async function POST(req: NextRequest) {
  const v = await validateBody(req, aiChatPayload);
  if (!v.ok) return v.response;

  const client = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'anon';
  if (rateLimited(client)) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'تعداد پیام‌ها زیاد شد؛ چند دقیقهٔ دیگر دوباره امتحان کن.' },
      { status: 429 },
    );
  }

  const cfg = getRelayConfig();
  if (!cfg) {
    // No relay configured (mock/preview) — tell the client to use its offline advisor.
    return NextResponse.json(
      { error: 'ai_unconfigured', message: 'دستیار ابری پیکربندی نشده است.' },
      { status: 503 },
    );
  }

  const { messages } = v.data;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      await runAdvisorTurn(cfg, messages, (e) => controller.enqueue(enc.encode(sse(e))));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
