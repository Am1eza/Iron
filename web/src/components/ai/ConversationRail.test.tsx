/**
 * The conversation history rail.
 *
 * The property that matters most is the one that is easy to get wrong: a
 * signed-out visitor is not an error state. Their conversations are stored
 * with a null `user_id` and are reachable only from the browser that created
 * them — the right privacy behaviour on the shared phone in a site office — so
 * a 401 has to read as an invitation, not a failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { conversations: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));

let authStatus = 'authenticated';
vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: authStatus }),
}));

import { api } from '@/lib/api';
import { ConversationRail } from './ConversationRail';

const conversations = api.ai.conversations as unknown as ReturnType<typeof vi.fn>;

const today = new Date().toISOString();
const yesterday = new Date(Date.now() - 26 * 3600_000).toISOString();
const lastMonth = new Date(Date.now() - 20 * 86_400_000).toISOString();

beforeEach(() => {
  authStatus = 'authenticated';
  conversations.mockReset();
});

describe('ConversationRail', () => {
  it('lists threads under a heading for when they happened', async () => {
    conversations.mockResolvedValue({
      conversations: [
        { id: 'a', title: '۲۰ تن میلگرد می‌خوام', updatedAt: today, messageCount: 4 },
        { id: 'b', title: 'قیمت ورق سیاه', updatedAt: yesterday, messageCount: 2 },
        { id: 'c', title: 'تیرآهن ۱۴ چند؟', updatedAt: lastMonth, messageCount: 6 },
      ],
    });
    render(<ConversationRail onOpen={vi.fn()} onNew={vi.fn()} />);

    expect(await screen.findByText('۲۰ تن میلگرد می‌خوام')).toBeInTheDocument();
    expect(screen.getByText('امروز')).toBeInTheDocument();
    expect(screen.getByText('دیروز')).toBeInTheDocument();
    expect(screen.getByText('ماه گذشته')).toBeInTheDocument();
  });

  it('opens the thread you pick, and closes the drawer behind you', async () => {
    conversations.mockResolvedValue({
      conversations: [{ id: 'a', title: 'قیمت میلگرد ۱۴', updatedAt: today, messageCount: 2 }],
    });
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<ConversationRail onOpen={onOpen} onNew={vi.fn()} onDismiss={onDismiss} />);

    await userEvent.click(await screen.findByRole('button', { name: /قیمت میلگرد ۱۴/ }));
    expect(onOpen).toHaveBeenCalledWith('a');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('marks the open conversation with aria-current, not colour alone', async () => {
    conversations.mockResolvedValue({
      conversations: [
        { id: 'a', title: 'اولی', updatedAt: today, messageCount: 2 },
        { id: 'b', title: 'دومی', updatedAt: today, messageCount: 2 },
      ],
    });
    render(<ConversationRail activeId="b" onOpen={vi.fn()} onNew={vi.fn()} />);
    const open = await screen.findByRole('button', { name: /دومی/ });
    expect(open).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /اولی/ })).not.toHaveAttribute('aria-current');
  });

  it('invites a guest to sign in rather than showing them an error', async () => {
    authStatus = 'anonymous';
    conversations.mockRejectedValue(new ApiError(401, 'وارد نشده‌اید.'));
    render(<ConversationRail onOpen={vi.fn()} onNew={vi.fn()} />);

    expect(await screen.findByRole('link', { name: 'وارد حساب کاربری' })).toHaveAttribute(
      'href',
      '/login?next=%2Fai',
    );
    // …and it says the conversation they are in right now is not lost.
    expect(screen.getByText(/گفتگوی فعلی‌ات همین‌جا می‌ماند/)).toBeInTheDocument();
  });

  it('offers a retry when the list genuinely fails', async () => {
    conversations.mockRejectedValueOnce(new ApiError(500, 'خطا'));
    render(<ConversationRail onOpen={vi.fn()} onNew={vi.fn()} />);
    const retry = await screen.findByRole('button', { name: 'دوباره تلاش کن' });

    conversations.mockResolvedValueOnce({
      conversations: [{ id: 'a', title: 'برگشت', updatedAt: today, messageCount: 2 }],
    });
    await userEvent.click(retry);
    expect(await screen.findByText('برگشت')).toBeInTheDocument();
  });

  it('says so plainly when a signed-in visitor has no history yet', async () => {
    conversations.mockResolvedValue({ conversations: [] });
    render(<ConversationRail onOpen={vi.fn()} onNew={vi.fn()} />);
    expect(await screen.findByText('هنوز گفتگوی ذخیره‌شده‌ای نداری.')).toBeInTheDocument();
  });

  it('waits for the session to resolve before deciding a visitor is a guest', async () => {
    // `AuthHydrator` settles the store after first paint; fetching on mount
    // alone would 401 for a signed-in customer and show them the guest state.
    authStatus = 'loading';
    conversations.mockResolvedValue({ conversations: [] });
    render(<ConversationRail onOpen={vi.fn()} onNew={vi.fn()} />);
    await waitFor(() => expect(conversations).not.toHaveBeenCalled());
  });
});
