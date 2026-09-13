/**
 * J-231 — SSE framing, at the byte level.
 *
 * Every other AdvisorChat test enqueues one whole `data: {...}\n\n` per chunk,
 * so the parser has never been shown the thing a real network actually does:
 * chunk boundaries that fall wherever the TCP segments landed. Two of those
 * boundaries are genuinely dangerous here.
 *
 * 1. Mid-character. Persian is 2 bytes per letter in UTF-8, and this app's
 *    answers are entirely Persian, so a split inside a character is the
 *    COMMON case, not the exotic one. A `TextDecoder` used without
 *    `{stream: true}` turns that half-character into U+FFFD — the visitor
 *    sees «قیم�ت» — and the surrounding JSON.parse may fail outright.
 * 2. Mid-frame. `\n\n` straddling two chunks must not be read as end-of-frame
 *    on the first half, or the frame is dropped and the answer loses text.
 *
 * These tests drive the stream ONE BYTE AT A TIME, which guarantees both
 * splits happen on every single frame rather than hoping a random chunking
 * hits them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorChat } from './AdvisorChat';
import { ApiError } from '@/lib/api/errors';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { chatStream: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

import { api } from '@/lib/api';
const chatStream = api.ai.chatStream as unknown as ReturnType<typeof vi.fn>;

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

/** The whole SSE payload, delivered in slices of `bytesPerChunk`. At 1 this
 *  splits every multi-byte character and every `\n\n`. */
function byteSlicedResponse(frames: Record<string, unknown>[], bytesPerChunk: number): Response {
  const enc = new TextEncoder();
  const all = enc.encode(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(''));
  let i = 0;
  return {
    body: new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= all.length) {
          c.close();
          return;
        }
        c.enqueue(all.slice(i, i + bytesPerChunk));
        i += bytesPerChunk;
      },
    }),
  } as Response;
}

const ANSWER = 'قیمت میلگرد ۱۶ ذوب‌آهن امروز ۴۲٬۵۰۰ تومان است.';

const ask = async (text = 'قیمت میلگرد ۱۶ چند است؟') => {
  const user = userEvent.setup();
  render(<AdvisorChat />);
  const input = await screen.findByLabelText('پیام به مشاور هوشمند');
  await user.type(input, `${text}{Enter}`);
};

beforeEach(() => {
  localStorage.clear();
  chatStream.mockReset();
});

describe('AdvisorChat SSE parsing — arbitrary chunk boundaries (J-231)', () => {
  it('reassembles Persian text split mid-character, with no replacement chars', async () => {
    chatStream.mockResolvedValue(
      byteSlicedResponse(
        [{ type: 'conversation', id: 'c1' }, { type: 'token', text: ANSWER }, { type: 'done' }],
        1,
      ),
    );
    await ask();

    // Anchored on the paragraph, not the amount: ChatMarkdown wraps a Toman
    // figure in its own <strong>, whose textContent is only that figure.
    const rendered = await screen.findByText(/ذوب‌آهن/, {}, { timeout: 5000 });
    // The exact text, not merely "something Persian arrived".
    expect(rendered.textContent).toContain(ANSWER);
    // U+FFFD is what a non-streaming decoder leaves behind at each split.
    expect(document.body.textContent).not.toContain('�');
  });

  it('does not drop a frame whose \\n\\n terminator lands across two chunks', async () => {
    const first = 'قیمت امروز ';
    const second = 'را از جدول زنده گرفتم.';
    chatStream.mockResolvedValue(
      byteSlicedResponse(
        [
          { type: 'conversation', id: 'c2' },
          { type: 'token', text: first },
          { type: 'token', text: second },
          { type: 'done' },
        ],
        1,
      ),
    );
    await ask();

    // Both frames survived AND stayed in order — a dropped middle frame would
    // leave the answer silently short rather than visibly broken.
    const rendered = await screen.findByText(/جدول زنده/, {}, { timeout: 5000 });
    expect(rendered.textContent).toContain(`${first}${second}`);
  });

  it('is not accidentally relying on one particular chunk size', async () => {
    // 3 bytes is a deliberately awkward stride against 2-byte Persian: the
    // phase between the two drifts, so different characters break at
    // different offsets across the stream.
    chatStream.mockResolvedValue(
      byteSlicedResponse(
        [{ type: 'conversation', id: 'c3' }, { type: 'token', text: ANSWER }, { type: 'done' }],
        3,
      ),
    );
    await ask();

    const rendered = await screen.findByText(/ذوب‌آهن/, {}, { timeout: 5000 });
    expect(rendered.textContent).toContain(ANSWER);
    expect(document.body.textContent).not.toContain('�');
  });
});
