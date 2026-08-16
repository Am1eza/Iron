/**
 * AdvisorChat — what the visitor is told when the LIVE advisor fails.
 *
 * The advisor never dead-ends: a failed turn is still answered by the local
 * grounded engine. What these cover is that the failure is no longer INVISIBLE
 * — every one of these paths used to drop the server's own message on the
 * floor and swap in a local answer with nothing to distinguish it, so a
 * rate-limited visitor and a visitor talking to a healthy relay saw literally
 * the same thing.
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
import { getRows } from '@/lib/mock/catalogData';
import { formatToman } from '@/lib/utils/format';

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

describe('AdvisorChat — live-turn failure is visible, not silent', () => {
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

  it('labels the reply when the relay is unavailable, instead of passing a local answer off as the advisor', async () => {
    chatStream.mockResolvedValue(
      sseResponse([{ type: 'error', message: 'دستیار هوشمند موقتاً در دسترس نیست.' }]),
    );
    await ask();
    expect(await screen.findByText(/این پاسخ نسخهٔ محلی است/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش دوباره/ })).toBeEnabled();
  });

  it('distinguishes a rate limit and counts down the server-stated wait', async () => {
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
  });

  it('keeps real partial output when the connection drops mid-stream, rather than replacing it with a local answer', async () => {
    chatStream.mockResolvedValue(
      droppedMidStream([
        { type: 'conversation', id: 'c1' },
        { type: 'token', text: 'قیمت میلگرد ۱۶ امروز' },
      ]),
    );
    await ask();
    expect(await screen.findByText(/پاسخ ناتمام ماند/, {}, { timeout: 3000 })).toBeInTheDocument();
    // The real model text survives...
    expect(screen.getByText(/قیمت میلگرد ۱۶ امروز/)).toBeInTheDocument();
    // ...and the lesser local engine did NOT overwrite it.
    expect(screen.queryByText(/قیمت کدام محصول را می‌خواهی/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش دوباره/ })).toHaveTextContent('ادامه بده');
  });

  it('retries the failed turn live and replaces the fallback answer rather than stacking a second one', async () => {
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

    expect(await screen.findByText(/۳۴٬۸۵۰ تومان بر کیلوگرم/, {}, { timeout: 3000 })).toBeInTheDocument();
    // The notice, and the answer it hung under, are gone — not duplicated.
    await waitFor(() => expect(screen.queryByText(/این پاسخ نسخهٔ محلی است/)).not.toBeInTheDocument());
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

  it('answers a named factory+size ask with a real priced answer during an outage, not the generic "which product?" prompt', async () => {
    chatStream.mockResolvedValue(
      sseResponse([{ type: 'error', message: 'دستیار هوشمند موقتاً در دسترس نیست.' }]),
    );
    // Pulled from the same mock catalog the fallback engine itself reads —
    // guaranteed to be a real, resolvable factory+size row, not a guess.
    const row = getRows('rebar')[0]!;
    const priceText = formatToman(row.current.price);
    await ask(`میلگرد ${row.size} ${row.factory} چنده؟`);
    expect(await screen.findByText(/این پاسخ نسخهٔ محلی است/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(
      await screen.findByText((content) => content.includes(priceText), {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/قیمت کدام محصول را می‌خواهی/)).not.toBeInTheDocument();
  });
});
