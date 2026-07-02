import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { aiChatPayload } from '@/lib/validation/api';
import { CONSTANTS } from '@/lib/config/constants';
import { getRelayConfig, type RelayConfig } from '@/lib/server/ai/deepseek';
import { runAdvisorTurn, type AdvisorEvent } from '@/lib/server/ai/engine';

/**
 * POST /api/ai/chat — the grounded AI advisor (DeepSeek via the out-of-Iran
 * relay). Streams SSE events: delta | card | chips | done | error. Every number
 * in the reply passed the grounding validator server-side (acceptance-criteria §D).
 */

/* Best-effort per-isolate rate limit (cost guard) — fixed window {count,resetAt}:
 * O(1) per hit, bounded by evicting only EXPIRED windows (never wiping live
 * counters, so a key-spraying abuser can't reset their own budget). A durable/KV
 * limiter replaces this in the backend layer. */
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const cur = hits.get(key);
  if (!cur || cur.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + CONSTANTS.AI_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (cur.count >= CONSTANTS.AI_RATE_LIMIT_MAX) return true;
  cur.count += 1;
  return false;
}

const sse = (e: AdvisorEvent) => `data: ${JSON.stringify(e)}\n\n`;

export async function POST(req: NextRequest) {
  const v = await validateBody(req, aiChatPayload);
  if (!v.ok) return v.response;

  const client =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anon';
  if (rateLimited(client)) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'تعداد پیام‌ها زیاد شد؛ چند دقیقهٔ دیگر دوباره امتحان کن.' },
      { status: 429 },
    );
  }

  // getServerEnv throws in live mode when DEEPSEEK_* is missing — that
  // misconfiguration must surface as the documented 503, not a raw 500.
  let cfg: RelayConfig | null = null;
  try {
    cfg = getRelayConfig();
  } catch {
    cfg = null;
  }
  if (!cfg) {
    // No relay configured (mock/preview) — tell the client to use its offline advisor.
    return NextResponse.json(
      { error: 'ai_unconfigured', message: 'دستیار ابری پیکربندی نشده است.' },
      { status: 503 },
    );
  }

  const { messages } = v.data;
  const relay = cfg;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      // A cancelled stream (closed tab) makes enqueue throw — swallow it so the
      // engine's never-throws contract holds and teardown stays clean.
      const send = (e: AdvisorEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(sse(e)));
        } catch {
          closed = true;
        }
      };
      await runAdvisorTurn(relay, messages, send, undefined, req.signal);
      if (!closed) {
        try {
          controller.close();
        } catch {
          /* already cancelled */
        }
      }
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
