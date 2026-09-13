// @vitest-environment node
/**
 * J-219 end-to-end: the detector is only worth anything if the pipeline
 * actually counts with it. A unit-tested `addedQueryTokens` that nothing
 * calls would be a monitoring feature that reports 0٪ forever — which is
 * worse than no feature, because the admin console would then be quietly
 * asserting a problem doesn't exist.
 *
 * Driven through `runAdvisorPipeline` with a scripted stream that issues a
 * real tool call, so what is asserted is `trace.queryRewrites` as the admin
 * console will actually receive it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { runAdvisorPipeline, type StreamCompletionFn } from './pipeline';
import { buildChatMessages } from './conversation';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import type { Db } from '@/lib/server/db/client';

// The log line is a side effect of the counter, not the thing under test.
vi.mock('@/lib/errors/report', () => ({ reportError: vi.fn() }));

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
}, 120_000);
afterAll(async () => {
  await close();
});

/** One getPrice call with `query`, then a plain (number-free) answer. */
function streamCallingGetPrice(query: string): StreamCompletionFn {
  let call = 0;
  return async function* () {
    call += 1;
    if (call === 1) {
      yield {
        type: 'tool_calls',
        calls: [
          {
            id: 'call-1',
            type: 'function' as const,
            function: { name: 'getPrice', arguments: JSON.stringify({ query }) },
          },
        ],
      };
      yield { type: 'done' };
    } else {
      yield { type: 'token', text: 'برای این محصول با کارشناس هماهنگ می‌کنم.' };
      yield { type: 'done' };
    }
  };
}

async function traceFor(userText: string, toolQuery: string) {
  const clientMessages = [{ role: 'user' as const, content: userText }];
  const result = await runAdvisorPipeline({
    messages: buildChatMessages(clientMessages, null),
    clientMessages,
    userNumbers: new Set(),
    session: null,
    stream: streamCallingGetPrice(toolQuery),
  });
  return result.trace;
}

describe('runAdvisorPipeline — query-rewrite telemetry (J-219)', () => {
  it('counts a turn where the model narrowed the query past the visitor’s words', async () => {
    // The visitor asked an ambiguous question; the model resolved it to one
    // factory on its own instead of letting the choice chips surface.
    const trace = await traceFor('قیمت میلگرد ۱۴ چند است؟', 'میلگرد ۱۴ ذوب‌آهن');
    expect(trace.queryRewrites).toBe(1);
    expect(trace.toolCalls).toBe(1);
  });

  it('counts nothing when the query stays inside what the visitor asked', async () => {
    const trace = await traceFor('قیمت میلگرد ۱۴ ذوب‌آهن چند است؟', 'میلگرد ۱۴ ذوب‌آهن');
    expect(trace.queryRewrites).toBe(0);
    expect(trace.toolCalls).toBe(1);
  });

  it('is a counter, not a guard — the turn still answers normally', async () => {
    const clientMessages = [{ role: 'user' as const, content: 'قیمت میلگرد ۱۴ چند است؟' }];
    const result = await runAdvisorPipeline({
      messages: buildChatMessages(clientMessages, null),
      clientMessages,
      userNumbers: new Set(),
      session: null,
      stream: streamCallingGetPrice('میلگرد ۱۴ ذوب‌آهن'),
    });
    // The audit asked for a rate before a guard: blocking this would break
    // the legitimate "carried forward from an earlier turn" case.
    expect(result.trace.queryRewrites).toBe(1);
    expect(result.text.trim().length).toBeGreaterThan(0);
  });
});
