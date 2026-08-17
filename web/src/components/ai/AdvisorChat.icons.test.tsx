/**
 * AdvisorChat — the controls must be drawn, never typed.
 *
 * Production self-hosts its fonts and ships no CDN and no emoji font (Iran
 * reachability, a locked decision), so `👍` / `👎` / `⏹` had no glyph and
 * rendered as empty tofu boxes — under every single advisor answer. These
 * assert the controls carry an SVG and no emoji character, so a future edit
 * can't quietly reintroduce a character the deployed font cannot draw.
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

/** Anything outside the BMP-adjacent text ranges the self-hosted font covers:
 *  emoji, dingbats, geometric shapes, misc symbols. */
const EMOJI_OR_DINGBAT =
  /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/u;

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

const ANSWER = [
  { type: 'token', text: 'قیمت امروز میلگرد را برایت آوردم.' },
  { type: 'done', messageId: 'msg-1' },
];

describe('AdvisorChat — controls are SVG icons, not font glyphs', () => {
  beforeEach(() => {
    localStorage.clear();
    chatStream.mockReset();
    chatStream.mockResolvedValue(sseResponse(ANSWER));
  });

  it('draws the send button as an icon with no dingbat character', async () => {
    render(<AdvisorChat />);
    const send = await screen.findByLabelText('ارسال');
    expect(send.querySelector('svg')).toBeTruthy();
    expect(send.textContent ?? '').not.toMatch(EMOJI_OR_DINGBAT);
  });

  it('draws both feedback controls as icons, with no emoji text', async () => {
    const user = userEvent.setup();
    render(<AdvisorChat />);
    const input = await screen.findByLabelText('پیام به مشاور هوشمند');
    await user.type(input, 'قیمت میلگرد؟{Enter}');

    const up = await screen.findByLabelText('پاسخ مفید بود');
    const down = screen.getByLabelText('پاسخ مفید نبود');
    for (const btn of [up, down]) {
      expect(btn.querySelector('svg')).toBeTruthy();
      expect(btn.textContent ?? '').not.toMatch(EMOJI_OR_DINGBAT);
    }
  });

  it('draws the stop control as an icon while an answer is streaming', async () => {
    // A stream that stays open, so the composer keeps showing «توقف پاسخ».
    chatStream.mockResolvedValue({
      body: new ReadableStream<Uint8Array>({ start() {} }),
    } as Response);
    const user = userEvent.setup();
    render(<AdvisorChat />);
    const input = await screen.findByLabelText('پیام به مشاور هوشمند');
    await user.type(input, 'قیمت میلگرد؟{Enter}');

    await waitFor(() => expect(screen.getByLabelText('توقف پاسخ')).toBeInTheDocument());
    const stop = screen.getByLabelText('توقف پاسخ');
    expect(stop.querySelector('svg')).toBeTruthy();
    expect(stop.textContent ?? '').not.toMatch(EMOJI_OR_DINGBAT);
  });
});
