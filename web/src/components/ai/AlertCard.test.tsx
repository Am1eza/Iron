/**
 * The advisor's هشدار قیمت card (J-223).
 *
 * The invariant under test is the same one the route enforces from the other
 * side: nothing is armed until this button is pressed. So the tests are about
 * what the card PROMISES — it says out loud that nothing is registered yet, it
 * sends the visitor to login rather than offering a confirm that would 401,
 * and one press cannot become two alerts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';

let authStatus = 'authenticated';
vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { confirmAlert: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: authStatus }),
}));

import { api } from '@/lib/api';
import { AlertCard, type AlertDraftView } from './AlertCard';

const confirmAlert = api.ai.confirmAlert as unknown as ReturnType<typeof vi.fn>;

const DRAFT: AlertDraftView = {
  draftId: 'a1',
  product: 'میلگرد ۱۴ ذوب‌آهن',
  op: 'below',
  threshold: 42_000,
};

beforeEach(() => {
  confirmAlert.mockReset();
  authStatus = 'authenticated';
});

describe('AlertCard', () => {
  it('states that nothing is armed yet, and arms it only when pressed', async () => {
    confirmAlert.mockResolvedValue({ ok: true, merged: false, product: DRAFT.product, message: 'ok' });
    const onConfirmed = vi.fn();
    render(<AlertCard draft={DRAFT} onConfirmed={onConfirmed} />);

    // The whole point of the draft/confirm split, said to the visitor:
    expect(screen.getByText(/هیچ هشداری ثبت نمی‌شود/)).toBeInTheDocument();
    expect(screen.getByText(/اگر قیمت میلگرد ۱۴ ذوب‌آهن/)).toBeInTheDocument();
    expect(confirmAlert).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ثبت هشدار' }));

    await waitFor(() => expect(confirmAlert).toHaveBeenCalledWith('a1'));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onConfirmed.mock.calls[0]![0]).toMatchObject({ merged: false });
    expect(onConfirmed.mock.calls[0]![0].confirmedAt).toBeTruthy();
  });

  it('cannot be double-armed by a double-tap', async () => {
    let release!: (v: unknown) => void;
    confirmAlert.mockReturnValue(new Promise((r) => (release = r)));
    render(<AlertCard draft={DRAFT} onConfirmed={vi.fn()} />);

    const btn = screen.getByRole('button', { name: 'تأیید و ثبت هشدار' });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    await userEvent.click(btn);

    release({ ok: true, merged: false, product: DRAFT.product, message: 'ok' });
    await waitFor(() => expect(confirmAlert).toHaveBeenCalledTimes(1));
  });

  it('offers login instead of a confirm that would 401', () => {
    authStatus = 'anonymous';
    render(<AlertCard draft={DRAFT} onConfirmed={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'تأیید و ثبت هشدار' })).toBeNull();
    expect(screen.getByRole('link', { name: 'ورود به حساب کاربری' })).toBeInTheDocument();
  });

  it('surfaces the server message on failure and stays pressable', async () => {
    confirmAlert.mockRejectedValue(new ApiError(409, 'سقف هشدارهای فعال تو پر است.'));
    render(<AlertCard draft={DRAFT} onConfirmed={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ثبت هشدار' }));

    expect(await screen.findByText(/سقف هشدارهای فعال تو پر است/)).toBeInTheDocument();
    // Not a dead end: the cap can be freed in another tab and retried here.
    expect(screen.getByRole('button', { name: 'تأیید و ثبت هشدار' })).toBeEnabled();
  });

  it('a restored thread shows the alert as already registered, with no second button', () => {
    render(
      <AlertCard draft={{ ...DRAFT, confirmedAt: '2026-09-12T10:00:00Z' }} onConfirmed={vi.fn()} />,
    );

    expect(screen.getByText('هشدار ثبت شد')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'مدیریت هشدارها' })).toBeInTheDocument();
  });

  it('does not claim a new alert when the server merged into an existing one', () => {
    render(
      <AlertCard
        draft={{ ...DRAFT, confirmedAt: '2026-09-12T10:00:00Z', merged: true }}
        onConfirmed={vi.fn()}
      />,
    );
    expect(screen.getByText('این هشدار از قبل فعال بود')).toBeInTheDocument();
  });
});
