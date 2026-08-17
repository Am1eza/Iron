/**
 * AdvisorChat — the UI's own copy speaks تو, like the model now does.
 *
 * The audit's PR-B finding was two registers on one screen: the greeting and
 * the composer talk to the visitor as تو, the answers and three of the card's
 * own lines used شما. The model side is a prompt rule (see
 * lib/server/ai/register.test.ts); this is the fixed UI copy around it, which
 * is the half that can be pinned in CI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorChat, GREETING_TEXT } from './AdvisorChat';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/stores/auth';
import { formalMarkersIn } from '@/test/persianRegister';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { chatStream: vi.fn(), confirmLead: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

import { api } from '@/lib/api';
const chatStream = api.ai.chatStream as unknown as ReturnType<typeof vi.fn>;
const confirmLead = api.ai.confirmLead as unknown as ReturnType<typeof vi.fn>;

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

/** A turn that renders the widest set of fixed strings at once: the draft
 *  card (its two notes), the feedback row, and the answer bubble. */
const DRAFT_FRAMES = [
  {
    type: 'leadDraft',
    draftId: 'draft-1',
    items: [{ name: 'میلگرد ۱۴ آجدار A3 ذوب‌آهن', qty: 2, unit: 'branch', weightKg: 148 }],
    totalWeightKg: 148,
    // Deliberately not fully priced, so the «قیمت بعضی اقلام…» note renders.
    allPriced: false,
    signedIn: true,
  },
  { type: 'token', text: 'خلاصهٔ درخواستت آماده است.' },
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

/** Everything a sighted visitor actually reads. The visually-hidden speaker
 *  labels are excluded on purpose: «شما: » there names who is talking in the
 *  screen-reader transcript, it does not address the visitor, and «تو: » would
 *  read as a stranger convention to an AT user. */
function visibleText(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.visually-hidden').forEach((n) => n.remove());
  return copy.textContent ?? '';
}

describe('AdvisorChat — one register in the UI copy', () => {
  beforeEach(() => {
    localStorage.clear();
    chatStream.mockReset();
    confirmLead.mockReset();
    chatStream.mockResolvedValue(sseResponse(DRAFT_FRAMES));
    useAuthStore.getState().setUser({ id: 'u1', mobile: '09121234567', role: 'customer' });
  });

  it('greets in تو before anything is typed', () => {
    const { container } = render(<AdvisorChat />);
    expect(GREETING_TEXT).toContain('کمکت می‌کنم');
    expect(formalMarkersIn(visibleText(container))).toEqual([]);
  });

  it('keeps تو through an answer, its confirmation card and the feedback row', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdvisorChat />);
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'پیش‌فاکتور می‌خوام{Enter}');

    // The card's own two notes are the strings that used to say شما.
    expect(await screen.findByText(/درخواستت مستقیم به تیم فروش می‌رود/, {}, { timeout: 3000 }))
      .toBeInTheDocument();
    await user.click(screen.getByLabelText('پاسخ مفید بود'));
    expect(await screen.findByText('ممنون از بازخوردت')).toBeInTheDocument();

    expect(formalMarkersIn(visibleText(container))).toEqual([]);
  });

  it('keeps تو on the confirmed card, where the callback promise lives', async () => {
    confirmLead.mockResolvedValue({ ref: 'PF-14050526-0001-ABCDEF' });
    const user = userEvent.setup();
    const { container } = render(<AdvisorChat />);
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'پیش‌فاکتور می‌خوام{Enter}');
    await user.click(
      await screen.findByRole('button', { name: 'تأیید و ثبت درخواست' }, { timeout: 3000 }),
    );

    await waitFor(() => expect(screen.getByText(/کد پیگیری/)).toBeInTheDocument());
    expect(screen.getByText(/کارشناس فروش برای نهایی‌کردن قیمت و زمان تحویل با تو تماس می‌گیرد/))
      .toBeInTheDocument();
    expect(formalMarkersIn(visibleText(container))).toEqual([]);
  });

  it('keeps تو in every failure notice the visitor can be shown', async () => {
    chatStream.mockResolvedValue(sseResponse([{ type: 'error', message: 'هرچه' }]));
    const user = userEvent.setup();
    const { container } = render(<AdvisorChat />);
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'قیمت میلگرد؟{Enter}');

    expect(await screen.findByRole('button', { name: /تلاش دوباره/ }, { timeout: 3000 }))
      .toBeInTheDocument();
    expect(formalMarkersIn(visibleText(container))).toEqual([]);
  });
});
