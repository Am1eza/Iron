/**
 * AdvisorChat — the generative-UI wire, end to end on the client.
 *
 * The server half (which card, built from which rows) is covered by
 * ai/blockBuilders.test.ts, and the cards themselves by
 * blocks/AdvisorBlocks.test.tsx. What is only testable here is the seam
 * between them: a `{type:'block'}` frame has to become a rendered card
 * attached to the right message, a tap on that card has to continue the
 * conversation as a normal turn, and a frame the client does not understand
 * has to be ignored without taking the answer down with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorChat } from './AdvisorChat';
import { ApiError } from '@/lib/api/errors';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { chatStream: vi.fn(), confirmLead: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

import { api } from '@/lib/api';
const chatStream = api.ai.chatStream as unknown as ReturnType<typeof vi.fn>;

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

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

const OPTIONS_BLOCK = {
  kind: 'options',
  subject: 'میلگرد',
  question: 'کدام سایز میلگرد را می‌خواهی؟',
  groups: [
    {
      title: 'سایز',
      options: [
        { label: '۱۴', send: 'قیمت میلگرد ۱۴' },
        { label: '۱۶', send: 'قیمت میلگرد ۱۶' },
      ],
    },
  ],
};

const COMPARE_BLOCK = {
  kind: 'compare',
  title: 'میلگرد · آجدار',
  subtitle: 'سایز ۱۴ · ۲۰ تن',
  updatedAt: '2026-08-01T09:30:00.000Z',
  tonnage: 20,
  rows: [
    { factory: 'فایکو', pricePerKg: 41_000, totalToman: 820_000_000, rowCount: 2, updatedAt: '2026-08-01T09:30:00.000Z', cheapest: true },
    { factory: 'ذوب‌آهن', pricePerKg: 42_000, totalToman: 840_000_000, rowCount: 2, updatedAt: '2026-08-01T09:00:00.000Z' },
  ],
};

async function ask(text = 'قیمت میلگرد چنده؟') {
  const user = userEvent.setup();
  render(<AdvisorChat />);
  await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), `${text}{Enter}`);
  return user;
}

describe('AdvisorChat — tool output arrives as UI, not as a paragraph', () => {
  beforeEach(() => {
    localStorage.clear();
    chatStream.mockReset();
  });

  it('renders a block frame as a real card under the answer', async () => {
    chatStream.mockResolvedValue(
      sseResponse([
        { type: 'block', block: COMPARE_BLOCK },
        { type: 'token', text: 'فایکو امروز ارزان‌ترین است.' },
        { type: 'done', messageId: 'm1' },
      ]),
    );
    await ask();
    expect(await screen.findByText('مقایسهٔ کارخانه‌ها', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('فایکو')).toBeInTheDocument();
    expect(screen.getByText('ارزان‌ترین')).toBeInTheDocument();
    // …and the model's own prose is still there, above it.
    expect(screen.getByText(/فایکو امروز ارزان‌ترین است/)).toBeInTheDocument();
  });

  it('tapping a picker chip continues the conversation as a normal turn', async () => {
    chatStream.mockResolvedValue(
      sseResponse([
        { type: 'block', block: OPTIONS_BLOCK },
        { type: 'token', text: 'کدام سایز؟ یکی از دکمه‌ها را بزن یا خودت بنویس.' },
        { type: 'done', messageId: 'm1' },
      ]),
    );
    const user = await ask();
    const chip = await screen.findByRole('button', { name: '۱۶' }, { timeout: 3000 });

    chatStream.mockResolvedValue(sseResponse([{ type: 'token', text: 'باشه.' }, { type: 'done' }]));
    await user.click(chip);

    // Byte-identical to typing it: the same string reaches the server, and it
    // appears in the thread as the visitor's own message.
    await waitFor(() => {
      const sent = chatStream.mock.calls.at(-1)![0] as { role: string; content: string }[];
      expect(sent.at(-1)).toEqual({ role: 'user', content: 'قیمت میلگرد ۱۶' });
    });
    expect(await screen.findByText('قیمت میلگرد ۱۶', { selector: 'p' })).toBeInTheDocument();
  });

  it('a card with no prose is still a complete answer', async () => {
    // The model occasionally answers with nothing after a successful tool
    // round (a measured ~1-in-10 event — see pipeline.ts's AnswerTrace). With
    // a card on screen that is no longer an empty bubble: the card IS the
    // answer, and the turn must not be reported as a failure.
    chatStream.mockResolvedValue(
      sseResponse([{ type: 'block', block: COMPARE_BLOCK }, { type: 'done', messageId: 'm1' }]),
    );
    await ask();
    expect(await screen.findByText('مقایسهٔ کارخانه‌ها', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/موقتاً در دسترس نیست/)).not.toBeInTheDocument();
  });

  it('ignores a block kind it does not know rather than dropping the answer', async () => {
    chatStream.mockResolvedValue(
      sseResponse([
        { type: 'block', block: { kind: 'a-kind-from-a-newer-deploy' } },
        { type: 'block', block: COMPARE_BLOCK },
        { type: 'token', text: 'این هم مقایسه.' },
        { type: 'done', messageId: 'm1' },
      ]),
    );
    await ask();
    expect(await screen.findByText(/این هم مقایسه/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('مقایسهٔ کارخانه‌ها')).toBeInTheDocument();
  });

  it('does not collide ids with a restored thread — the duplicate-key bug', async () => {
    // `seq` restarts at 0 on every page load while localStorage still holds
    // `m1`, so the first new message used to key-collide with the first
    // restored one. React then reused one message's DOM for the other, which
    // with an editable پیش‌فاکتور card in the thread meant the live card's
    // fields drove the OLD, expired draft id.
    chatStream.mockResolvedValue(
      sseResponse([{ type: 'token', text: 'اولی.' }, { type: 'done', messageId: 'm1' }]),
    );
    const first = render(<AdvisorChat />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'سؤال اول{Enter}');
    await screen.findByText('اولی.', {}, { timeout: 3000 });
    first.unmount();

    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
    try {
      chatStream.mockResolvedValue(
        sseResponse([{ type: 'token', text: 'دومی.' }, { type: 'done', messageId: 'm2' }]),
      );
      render(<AdvisorChat />);
      await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'سؤال دوم{Enter}');
      await screen.findByText('دومی.', {}, { timeout: 3000 });
      expect(errors.flat().join(' ')).not.toContain('same key');
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the cards when the thread is restored from storage', async () => {
    chatStream.mockResolvedValue(
      sseResponse([
        { type: 'block', block: COMPARE_BLOCK },
        { type: 'token', text: 'فایکو ارزان‌تر است.' },
        { type: 'done', messageId: 'm1' },
      ]),
    );
    const { unmount } = render(<AdvisorChat />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'قیمت میلگرد{Enter}');
    await screen.findByText('مقایسهٔ کارخانه‌ها', {}, { timeout: 3000 });
    unmount();

    render(<AdvisorChat />);
    // A restored price card still states the age of its own number — which is
    // exactly why persisting it is honest rather than misleading.
    expect(await screen.findByText('مقایسهٔ کارخانه‌ها', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/آخرین به‌روزرسانی/)).toBeInTheDocument();
  });
});
