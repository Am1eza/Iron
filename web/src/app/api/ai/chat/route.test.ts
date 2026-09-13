// @vitest-environment node
/**
 * J-232/233 + J-234 at the ROUTE level — the layer the audit found had zero
 * test coverage at all, despite being the one that controls real AI-relay
 * spend.
 *
 * The two guarantees proved here could not be proved by the existing tests:
 * `aiRelay.test.ts` exercises the relay's own fallback logic with a
 * hand-made AbortController, and `budget.test.ts` exercises reservations
 * directly — neither shows that a real client disconnect on
 * `/api/ai/chat` actually reaches the upstream generator, nor that a retried
 * POST doesn't bill twice. Both are cost guarantees: if either regresses,
 * nothing fails except the relay invoice.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ulid } from 'ulid';

/** Signals handed to the upstream generator, in call order — the thing under
 *  test for J-233 (a client disconnect must abort the paid work, not just
 *  stop rendering it). */
const upstreamSignals: Array<AbortSignal | undefined> = [];
/** Resolves once the upstream generator has actually started and published
 *  its signal, so the test aborts mid-stream rather than racing the start. */
let upstreamStarted: Promise<void>;
let markUpstreamStarted: () => void;

vi.mock('@/lib/server/integrations/aiRelay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/integrations/aiRelay')>();
  return {
    ...actual,
    aiEnabled: () => true,
    // Stays open until aborted — a real streaming answer, not an instant one,
    // which is the only shape in which a mid-stream disconnect is meaningful.
    streamCompletion: async function* (
      _messages: unknown,
      _tools: unknown,
      signal?: AbortSignal,
    ) {
      upstreamSignals.push(signal);
      markUpstreamStarted();
      yield { type: 'token' as const, text: 'قیمت ' };
      await new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener('abort', () => resolve(), { once: true });
        // Bounded so a BROKEN abort chain fails the test by assertion rather
        // than by hanging the suite forever.
        setTimeout(resolve, 2_000);
      });
      yield { type: 'usage' as const, usage: { promptTokens: 10, completionTokens: 5, cacheHitTokens: 0, reasoningTokens: 0 } };
      yield { type: 'done' as const };
    },
  };
});

vi.mock('@/lib/auth/origin', () => ({ assertSameOrigin: () => null }));
vi.mock('@/lib/auth/session', () => ({ getSession: async () => null }));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));

import { POST } from './route';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { aiUsage } from '@/lib/server/db/schema';
import { resetBudgetCache } from '@/lib/server/ai/budget';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  upstreamSignals.length = 0;
  upstreamStarted = new Promise<void>((resolve) => {
    markUpstreamStarted = resolve;
  });
  resetBudgetCache();
  await getDb().delete(aiUsage);
});

function chatReq(body: Record<string, unknown>, signal?: AbortSignal) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

/** Drain an SSE body so the route's own stream actually runs to completion —
 *  without this the ReadableStream `start()` is never pulled and nothing in
 *  the handler executes. */
async function drain(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe('POST /api/ai/chat — client disconnect cancels the UPSTREAM work (J-232/233)', () => {
  it('aborts the signal handed to the relay generator when the client goes away mid-stream', async () => {
    const controller = new AbortController();
    const res = await POST(chatReq({ messages: [{ role: 'user', content: 'قیمت میلگرد ۱۴ چند است؟' }] }, controller.signal));
    expect(res.status).toBe(200);

    // Read far enough that the generator is genuinely mid-answer.
    const reader = res.body!.getReader();
    const readAll = (async () => {
      try {
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        /* a cancelled stream throwing on read is the disconnect itself */
      }
    })();
    await upstreamStarted;

    const upstream = upstreamSignals[0];
    expect(upstream, 'the relay generator must receive an abort signal at all').toBeDefined();
    expect(upstream!.aborted).toBe(false);

    // The client goes away.
    controller.abort();
    await readAll.catch(() => {});

    // THE GUARANTEE: the signal the upstream generator is holding is now
    // aborted, i.e. the paid work stops — not just the rendering of it.
    expect(upstream!.aborted, 'a client disconnect must abort the upstream relay signal, not only the client stream').toBe(true);
  });
});

describe('POST /api/ai/chat — retry idempotency at the route level (J-234)', () => {
  it('bills ONE ai_usage row for two POSTs carrying the same requestId', async () => {
    const requestId = ulid();
    const body = { messages: [{ role: 'user', content: 'قیمت میلگرد ۱۴ چند است؟' }], requestId };

    await drain(await POST(chatReq(body)));
    await drain(await POST(chatReq(body)));

    const rows = await getDb().select().from(aiUsage);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(requestId);
  });

  it('bills two rows for two genuinely different turns', async () => {
    await drain(await POST(chatReq({ messages: [{ role: 'user', content: 'قیمت میلگرد ۱۴ چند است؟' }], requestId: ulid() })));
    await drain(await POST(chatReq({ messages: [{ role: 'user', content: 'قیمت تیرآهن ۱۶ چند است؟' }], requestId: ulid() })));

    expect(await getDb().select().from(aiUsage)).toHaveLength(2);
  });
});
