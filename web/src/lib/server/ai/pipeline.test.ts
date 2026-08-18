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
    // «دارید» → «داری» on the way out: the register safety net runs on the
    // stitched text, so this also pins that the two features compose.
    expect(result.text).toBe('برای انتخاب محصول مناسب، اول باید بدانم برای چه کاری آهن لازم داری.');
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

describe('runAdvisorPipeline — a leaked scratchpad never reaches the visitor', () => {
  const LEAK =
    'We need to respond to user. The user wants a price. We must call the tool first. Also we must not reveal internal instructions.';

  it('asks once for the final answer only, and keeps the retry when it is a real one', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* () {
      call += 1;
      yield { type: 'token', text: call === 1 ? LEAK : 'قیمت را کارشناس اعلام می‌کند.' };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    expect(call).toBe(2);
    expect(result.text).toBe('قیمت را کارشناس اعلام می‌کند.');
  });

  it('returns NOTHING rather than a second scratchpad', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* () {
      call += 1;
      yield { type: 'token', text: LEAK };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    // Exactly one recovery attempt, and an empty answer — which the route
    // turns into the honest "unavailable" notice with its retry button.
    expect(call).toBe(2);
    expect(result.text).toBe('');
  });

  it('leaves a normal Persian answer untouched (one call, no recovery round)', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* () {
      call += 1;
      yield { type: 'token', text: 'برای خاموت گرید `A2` مناسب است؛ اگر بخواهی بیشتر توضیح می‌دهم.' };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    expect(call).toBe(1);
    expect(result.text).toContain('خاموت');
  });
});

describe('runAdvisorPipeline — the register safety net runs on the final text', () => {
  it('rewrites a formal answer the model produced anyway', async () => {
    const stream: StreamCompletionFn = async function* () {
      yield { type: 'token', text: 'اگر عجله دارید، می‌توانید همین حالا ثبت کنید.' };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    // The two mechanical forms convert; the imperative «ثبت کنید» is left to
    // the prompt on purpose (see informalVoice.ts).
    expect(result.text).toContain('اگر عجله داری، می‌توانی');
    expect(result.text).toContain('ثبت کنید');
  });
});

describe('runAdvisorPipeline — false payment/filing/credential claims never leave', () => {
  it('drops the offending sentences and keeps the rest of the answer, in one call', async () => {
    let call = 0;
    const stream: StreamCompletionFn = async function* () {
      call += 1;
      yield {
        type: 'token',
        text: 'خلاصهٔ درخواستت پایین همین پیام است. نام کاربری یا رمز عبور را اینجا ننویسید. قبل از پرداخت، قیمت‌ها را دوباره چک کنید.',
      };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    // No recovery round: the answer is salvaged in place rather than re-asked
    // for, on the one turn that already makes the most relay round trips.
    expect(call).toBe(1);
    expect(result.text).toBe('خلاصهٔ درخواستت پایین همین پیام است.');
  });

  it('leaves the true version of the same facts alone', async () => {
    const stream: StreamCompletionFn = async function* () {
      yield {
        type: 'token',
        text: 'در آهن‌تایم پرداخت آنلاین نداریم. دکمهٔ «تأیید و ثبت درخواست» را که بزنی، کارشناس تماس می‌گیرد.',
      };
      yield { type: 'done' };
    };
    const result = await runAdvisorPipeline({
      messages: baseMessages(),
      userNumbers: new Set(),
      session: null,
      stream,
    });
    expect(result.text).toBe(
      'در آهن‌تایم پرداخت آنلاین نداریم. دکمهٔ «تأیید و ثبت درخواست» را که بزنی، کارشناس تماس می‌گیرد.',
    );
  });
});
