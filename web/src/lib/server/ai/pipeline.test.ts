// @vitest-environment node
/**
 * Truncation-continuation coverage (US-27.5) — isolated from evals.test.ts's
 * scenario harness since it exercises a mechanical stream-plumbing detail
 * (finish_reason:'length' → one bounded continuation call), not advisor
 * behavior/grounding. Deliberately number-free scripted text so nothing here
 * exercises the AC-D-3 grounding validator (out of scope for this file).
 */
import { describe, it, expect } from 'vitest';
import { runAdvisorPipeline, type StreamCompletionFn } from './pipeline';
import { buildChatMessages } from './conversation';

function baseMessages() {
  return buildChatMessages([{ role: 'user', content: 'سلام، راهنمایی می‌خواهم' }], null);
}

describe('runAdvisorPipeline — truncated finish_reason continuation (US-27.5)', () => {
  it('stitches ONE continuation onto a truncated final answer, withholding tools on the continuation call', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* (_messages, tools) {
      call += 1;
      if (call === 1) {
        yield { type: 'token', text: 'برای انتخاب محصول مناسب، اول باید بدانم' };
        yield { type: 'truncated' };
        yield { type: 'done' };
      } else {
        expect(tools).toEqual([]); // continuation call must withhold tools
        yield { type: 'token', text: ' برای چه کاری آهن لازم دارید.' };
        yield { type: 'done' };
      }
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    expect(call).toBe(2);
    expect(result.text).toBe('برای انتخاب محصول مناسب، اول باید بدانم برای چه کاری آهن لازم دارید.');
  });

  it('never continues more than once even if the continuation itself is also truncated', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* () {
      call += 1;
      yield { type: 'token', text: `بخش ${call}. ` };
      yield { type: 'truncated' };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    // One original round + exactly one continuation — never a third call.
    expect(call).toBe(2);
    expect(result.text).toBe('بخش 1. بخش 2. ');
  });

  it('a clean (non-truncated) answer never triggers a continuation call', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* () {
      call += 1;
      yield { type: 'token', text: 'پاسخ کامل و بدون قطعی.' };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    expect(call).toBe(1);
    expect(result.text).toBe('پاسخ کامل و بدون قطعی.');
  });
});
