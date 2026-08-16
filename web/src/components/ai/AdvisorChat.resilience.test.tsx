/**
 * AdvisorChat — what the visitor is told when the LIVE advisor fails.
 *
 * Owner decision: the advisor is ONE thing, not a real one that quietly
 * degrades to a rule-based impostor with no live model behind it. A failed
 * turn gets an honest "temporarily unavailable" notice and nothing else —
 * never a fabricated answer standing in for the real one. The one exception
 * is a genuine mid-stream drop: that partial text is REAL model output, so
 * it is kept rather than discarded.
 *
 * Frame timing note (measured against the live relay, not assumed): the server
 * buffers the whole answer for grounding validation and then emits it in one
 * burst — conversation → tool → [2–45s of silence] → every token within ~30ms.
 * So the `tool` frames are the only progress signal that exists, which is why
 * one of these asserts they reach the UI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorChat } from './AdvisorChat';
import { ApiError } from '@/lib/api/errors';

// Only the three bindings AdvisorChat actually consumes — mocked explicitly
// rather than spread over the real module, so pulling in `@/lib/api` (and its
// whole resource graph) can't drag network config into a jsdom run.
vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { chatStream: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

import { api } from '@/lib/api';
const chatStream = api.ai.chatStream as unknown as ReturnType<typeof vi.fn>;

/** A Response whose body streams the given SSE frames, then ends cleanly. */
function sseResponse(frames: Record<string, unknown>[]): Response {
  const enc = new TextEncoder();
  return {
    body: new ReadableStream<Uint8Array>({
      start(c) {
        for (const f of frames) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
        c.close();
      },
    }),
  } as Response;
}

/** A body that delivers real tokens and then FAILS mid-read — a genuine
 *  transport drop, as opposed to a clean `error` frame or a user abort. */
function droppedMidStream(frames: Record<string, unknown>[]): Response {
  const enc = new TextEncoder();
  let i = 0;
  return {
    body: new ReadableStream<Uint8Array>({
      pull(c) {
        if (i < frames.length) {
          c.enqueue(enc.encode(`data: ${JSON.stringify(frames[i++])}\n\n`));
          return;
        }
        c.error(new TypeError('network error'));
      },
    }),
  } as Response;
}

// jsdom implements no scrolling at all; the thread auto-scrolls on every
// message. Unrelated to what is under test here.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
};

describe('AdvisorChat — live-turn failure is visible, and never a fabricated answer', () => {
  beforeEach(() => {
    localStorage.clear();
    chatStream.mockReset();
    setOnline(true);
  });
  afterEach(() => {
    setOnline(true);
  });

  const ask = async (text = 'قیمت میلگرد ۱۶ چند است؟') => {
    const user = userEvent.setup();
    render(<AdvisorChat />);
    const input = await screen.findByLabelText('پیام به مشاور هوشمند');
    await user.type(input, `${text}{Enter}`);
    return user;
  };

  it('shows an honest unavailable notice when the relay fails — no fabricated answer stands in for it', async () => {
    chatStream.mockResolvedValue(
      sseResponse([{ type: 'error', message: 'دستیار هوشمند موقتاً در دسترس نیست.' }]),
    );
    await ask();
    expect(
      await screen.findByText(/دستیار هوشمند موقتاً در دسترس نیست/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش دوباره/ })).toBeEnabled();
    // The old rule-based engine used to answer "میلگرد ۱۶" questions with a
    // clarifying prompt of its own — that text must never appear now, since
    // no local engine runs on this path at all anymore.
    expect(screen.queryByText(/قیمت کدام محصول را می‌خواهی/)).not.toBeInTheDocument();
  });

  it('distinguishes a rate limit and counts down the server-stated wait — still no fabricated answer', async () => {
    chatStream.mockRejectedValue(
      new ApiError(429, 'درخواست‌ها بیش از حد است. کمی بعد دوباره تلاش کنید.', {
        code: 'rate_limited',
        retryAfterSeconds: 300,
      }),
    );
    await ask();
    expect(await screen.findByText(/پیام‌ها پشت‌سرهم ارسال شد/, {}, { timeout: 3000 })).toBeInTheDocument();
    // Waiting is what fixes THIS one, so retry stays disabled until it can work.
    expect(screen.getByRole('button', { name: /تلاش دوباره/ })).toBeDisabled();
    expect(screen.queryByText(/قیمت کدام محصول را می‌خواهی/)).not.toBeInTheDocument();
  });

  it('keeps real partial output when the connection drops mid-stream — this IS real model text, so it is kept', async () => {
    chatStream.mockResolvedValue(
      droppedMidStream([
        { type: 'conversation', id: 'c1' },
        { type: 'token', text: 'قیمت میلگرد ۱۶ امروز' },
      ]),
    );
    await ask();
    expect(await screen.findByText(/پاسخ ناتمام ماند/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/قیمت میلگرد ۱۶ امروز/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش دوباره/ })).toHaveTextContent('ادامه بده');
  });

  it('retries the failed turn live and replaces the notice with the real answer, not stacking a second one', async () => {
    chatStream
      .mockResolvedValueOnce(sseResponse([{ type: 'error', message: 'موقتاً در دسترس نیست.' }]))
      .mockResolvedValueOnce(
        sseResponse([
          { type: 'token', text: 'قیمت امروز ۳۴٬۸۵۰ تومان بر کیلوگرم است.' },
          { type: 'done', messageId: 'm1' },
        ]),
      );
    const user = await ask();
    const retry = await screen.findByRole('button', { name: /تلاش دوباره/ }, { timeout: 3000 });
    await user.click(retry);

    // The price renders as its own highlighted <strong> (ChatMarkdown's
    // price-run emphasis), so it and the rest of the sentence are separate
    // text nodes — checked separately rather than as one merged string.
    expect(await screen.findByText('۳۴٬۸۵۰ تومان', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/بر کیلوگرم است/)).toBeInTheDocument();
    // The notice is gone — not left stacked above the real answer.
    await waitFor(() => expect(screen.queryByText(/موقتاً در دسترس نیست/)).not.toBeInTheDocument());
    // The user's own message is untouched.
    expect(screen.getByText('قیمت میلگرد ۱۶ چند است؟')).toBeInTheDocument();
  });

  it('says nothing at all when the turn succeeds', async () => {
    chatStream.mockResolvedValue(
      sseResponse([{ type: 'token', text: 'سلام!' }, { type: 'done', messageId: 'm1' }]),
    );
    await ask();
    expect(await screen.findByText('سلام!', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تلاش دوباره/ })).not.toBeInTheDocument();
  });

  it('surfaces the running tool as progress — the only signal during the 2–45s wait', async () => {
    // Never resolves the stream: hold the turn open in its "working" state.
    const enc = new TextEncoder();
    chatStream.mockResolvedValue({
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'tool', name: 'getPrice' })}\n\n`));
        },
      }),
    } as Response);
    await ask();
    // Rendered twice on purpose: once visibly next to the dots, once in the
    // visually-hidden role="status" so it is announced too.
    const shown = await screen.findAllByText('در حال بررسی قیمت‌های امروز…', {}, { timeout: 3000 });
    expect(shown.length).toBeGreaterThanOrEqual(1);
  });

  it('blocks a send that is certain to fail while offline, and recovers the moment the connection returns', async () => {
    render(<AdvisorChat />);
    const input = await screen.findByLabelText('پیام به مشاور هوشمند');
    expect(input).toBeEnabled();

    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(/اتصال اینترنت قطع است/)).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(chatStream).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByText(/اتصال اینترنت قطع است/)).not.toBeInTheDocument();
  });

  it('keeps showing the honest notice on a SECOND message too after a permanent downgrade — never silently switches to a fake answer', async () => {
    // A 503 (ai_unconfigured) permanently switches useServer off — the bug
    // this covers: every send() after that used to call the local engine
    // directly with no notice attached at all, so message #2 in the same
    // session looked like a completely normal, unlabeled answer.
    chatStream.mockRejectedValue(
      new ApiError(503, 'دستیار هوشمند در دسترس نیست.', { code: 'ai_unconfigured' }),
    );
    const user = await ask('قیمت میلگرد ۱۶ چند است؟');
    await screen.findByText(/دستیار هوشمند موقتاً در دسترس نیست/, {}, { timeout: 3000 });

    const input = screen.getByLabelText('پیام به مشاور هوشمند');
    await user.type(input, 'قیمت تیرآهن چند است؟{Enter}');

    const notices = await screen.findAllByText(/دستیار هوشمند موقتاً در دسترس نیست/, {}, { timeout: 3000 });
    expect(notices.length).toBe(2);
    expect(screen.queryByText(/قیمت کدام محصول را می‌خواهی/)).not.toBeInTheDocument();
  });

  it('separates adjacent quick-reply chips with a real, copyable space — not just CSS gap', async () => {
    chatStream.mockResolvedValue(
      sseResponse([
        { type: 'token', text: 'وزن یک شاخه ۱۵۴.۸ کیلوگرم می‌شود.' },
        { type: 'chips', chips: ['دریافت پیش‌فاکتور', 'همهٔ قیمت‌ها'] },
        { type: 'done', messageId: 'm1' },
      ]),
    );
    await ask('وزن تیرآهن ۱۴ دوازده متری چقدره؟');
    const first = await screen.findByRole('button', { name: 'دریافت پیش‌فاکتور' }, { timeout: 3000 });
    const second = screen.getByRole('link', { name: 'همهٔ قیمت‌ها' });
    // Both chips share one flex row (`.chips`); the space text node between
    // them is a sibling of both, not a property of either — reading the
    // row's own textContent is what a copy/paste selection would produce.
    expect(first.parentElement).toBe(second.parentElement);
    expect(first.parentElement!.textContent).toBe('دریافت پیش‌فاکتور همهٔ قیمت‌ها');
  });
});
