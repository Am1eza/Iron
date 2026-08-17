/**
 * AdvisorChat — the پیش‌فاکتور CONFIRMATION card.
 *
 * The advisor no longer files a request on its own: `prepareProforma` sends a
 * `leadDraft` frame, the visitor sees what was collected as a list and presses
 * the button that actually submits it. A guest gets «ورود به حساب کاربری»
 * instead — the chat never asks a name or a mobile number, because a signed-in
 * customer's are already on file and a guest's arrive with the session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorChat } from './AdvisorChat';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/stores/auth';

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

const DRAFT_FRAMES = [
  {
    type: 'leadDraft',
    draftId: 'draft-1',
    items: [{ name: 'میلگرد ۱۴ آجدار A3 ذوب‌آهن', qty: 2, unit: 'branch', weightKg: 148, lineTotal: 6_000_000 }],
    totalWeightKg: 148,
    total: 6_000_000,
    allPriced: true,
    signedIn: true,
  },
  { type: 'token', text: 'خلاصهٔ درخواستت آماده است؛ تأیید کن تا ثبت شود.' },
  { type: 'done' },
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
  const input = await screen.findByLabelText('پیام به مشاور هوشمند');
  await user.type(input, 'پیش‌فاکتور می‌خوام{Enter}');
  return user;
}

describe('AdvisorChat — proforma confirmation card', () => {
  beforeEach(() => {
    localStorage.clear();
    chatStream.mockReset();
    confirmLead.mockReset();
    chatStream.mockResolvedValue(sseResponse(DRAFT_FRAMES));
    useAuthStore.getState().setUser(null);
  });

  it('lists what the advisor collected and files it only when the visitor confirms', async () => {
    useAuthStore.getState().setUser({
      id: 'u1',
      mobile: '09121234567',
      name: 'رضا کریمی',
      role: 'customer',
    });
    confirmLead.mockResolvedValue({ ref: 'PF-14050526-0001-ABCDEF', proformaRef: 'PF-14050526-0001-ABCDEF', total: 6_000_000 });

    const user = await askForProforma();

    // The list — what is about to be submitted, before anything is submitted.
    expect(await screen.findByText('خلاصهٔ درخواست پیش‌فاکتور', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('میلگرد ۱۴ آجدار A3 ذوب‌آهن')).toBeInTheDocument();
    expect(screen.getByText('وزن کل')).toBeInTheDocument();
    expect(confirmLead).not.toHaveBeenCalled(); // nothing filed yet

    await user.click(screen.getByRole('button', { name: 'تأیید و ثبت درخواست' }));

    await waitFor(() => expect(confirmLead).toHaveBeenCalledWith('draft-1'));
    expect(await screen.findByText(/کد پیگیری/)).toBeInTheDocument();
    // The button is gone once confirmed — the draft is single-use server-side.
    expect(screen.queryByRole('button', { name: 'تأیید و ثبت درخواست' })).not.toBeInTheDocument();
  });

  it('offers a guest the login button instead of asking for a name and mobile in the chat', async () => {
    chatStream.mockResolvedValue(
      sseResponse(DRAFT_FRAMES.map((f) => (f.type === 'leadDraft' ? { ...f, signedIn: false } : f))),
    );
    useAuthStore.getState().setUser(null);

    await askForProforma();

    const login = await screen.findByRole('link', { name: 'ورود به حساب کاربری' }, { timeout: 3000 });
    expect(login).toHaveAttribute('href', '/login?next=%2Fai');
    expect(screen.queryByRole('button', { name: 'تأیید و ثبت درخواست' })).not.toBeInTheDocument();
    expect(confirmLead).not.toHaveBeenCalled();
  });

  it('keeps the card usable when the submit fails — the request is not silently lost', async () => {
    useAuthStore.getState().setUser({
      id: 'u1',
      mobile: '09121234567',
      role: 'customer',
    });
    confirmLead.mockRejectedValue(new ApiError(410, 'این خلاصه منقضی شده؛ دوباره از مشاور پیش‌فاکتور بخواه.'));

    const user = await askForProforma();
    await user.click(
      await screen.findByRole('button', { name: 'تأیید و ثبت درخواست' }, { timeout: 3000 }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('این خلاصه منقضی شده');
    expect(screen.getByRole('button', { name: 'تأیید و ثبت درخواست' })).toBeEnabled();
  });
});
