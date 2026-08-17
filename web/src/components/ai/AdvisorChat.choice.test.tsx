/**
 * AdvisorChat — answering «کدام کارخانه؟» with one tap.
 *
 * The server side of PR-C decides WHICH options become chips (aiTools'
 * chipsForChoice, carried out by the pipeline and emitted on the existing
 * `chips` SSE frame). This is the client half: the frame has to render as real
 * buttons, and tapping one has to continue the conversation with exactly the
 * text a visitor would otherwise have had to type — the typed-name path is not
 * replaced, it is what the tap reuses.
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

const OPTIONS = ['میلگرد آجدار ۱۶ فایکو', 'میلگرد آجدار ۱۶ ذوب‌آهن اصفهان'];

/** What the route sends for a `needs_choice` turn: the model's short question,
 *  then the options as chips. */
const CHOICE_FRAMES = [
  { type: 'token', text: 'از کدام کارخانه می‌خواهی؟ یکی از گزینه‌های زیر را بزن یا نامش را بنویس.' },
  { type: 'chips', chips: OPTIONS },
  { type: 'done', messageId: 'msg-1' },
];

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

async function askForProforma() {
  const user = userEvent.setup();
  render(<AdvisorChat />);
  await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'پیش‌فاکتور میلگرد ۱۶{Enter}');
  return user;
}

describe('AdvisorChat — a multi-option answer is tappable', () => {
  beforeEach(() => {
    localStorage.clear();
    chatStream.mockReset();
    chatStream.mockResolvedValue(sseResponse(CHOICE_FRAMES));
  });

  it('renders each option as its own button', async () => {
    await askForProforma();
    for (const option of OPTIONS) {
      expect(await screen.findByRole('button', { name: option }, { timeout: 3000 })).toBeInTheDocument();
    }
  });

  it('tapping one continues the conversation with that exact product name', async () => {
    const user = await askForProforma();
    const chip = await screen.findByRole('button', { name: OPTIONS[1]! }, { timeout: 3000 });

    chatStream.mockResolvedValue(
      sseResponse([{ type: 'token', text: 'باشه، همان را آماده می‌کنم.' }, { type: 'done' }]),
    );
    await user.click(chip);

    // The tap is a normal turn: the label is sent as the visitor's message —
    // byte-identical to typing the factory name, which is the path the server
    // resolves the product on. It shows in the thread as their own message.
    await waitFor(() => {
      const sent = chatStream.mock.calls.at(-1)![0] as { role: string; content: string }[];
      expect(sent.at(-1)).toEqual({ role: 'user', content: OPTIONS[1] });
    });
    expect(await screen.findByText(OPTIONS[1]!, { selector: 'p' })).toBeInTheDocument();
  });

  it('leaves typing the name yourself working exactly as before', async () => {
    const user = await askForProforma();
    await screen.findByRole('button', { name: OPTIONS[0]! }, { timeout: 3000 });

    chatStream.mockResolvedValue(
      sseResponse([{ type: 'token', text: 'باشه.' }, { type: 'done' }]),
    );
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'فایکو{Enter}');

    await waitFor(() => {
      const sent = chatStream.mock.calls.at(-1)![0] as { role: string; content: string }[];
      expect(sent.at(-1)).toEqual({ role: 'user', content: 'فایکو' });
    });
  });
});
