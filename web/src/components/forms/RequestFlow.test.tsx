/**
 * RequestFlow — the پیش‌فاکتور submit step.
 *
 * The one thing that must never happen here: a submitted request that only
 * lands in browser storage while the UI claims it reached the sales team. The
 * component used to fall through to the local `requests` store whenever the
 * auth store had no user — which is true both for a guest AND for the first
 * frame of a genuinely signed-in visitor, before `AuthHydrator` resolves
 * GET /api/me. Both paths silently lost the lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestFlow } from './RequestFlow';
import { useAuthStore } from '@/lib/stores/auth';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import type * as ApiConfig from '@/lib/api/config';

vi.mock('@/lib/api/config', async (orig) => ({
  ...(await orig<typeof ApiConfig>()),
  API_MODE: 'live',
}));
vi.mock('@/lib/api', () => ({ api: { leads: { create: vi.fn() } } }));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

import { api } from '@/lib/api';
const createLead = api.leads.create as unknown as ReturnType<typeof vi.fn>;

const ITEM = { skuId: 'sku-1', name: 'میلگرد ۱۴ آجدار A3', qty: 2, unit: 'branch' as const, unitPrice: 40_000, weightKg: 74 };

beforeEach(() => {
  vi.clearAllMocks();
  useCartStore.setState({ items: [ITEM] });
  useRequestsStore.setState({ requests: [] });
  createLead.mockResolvedValue({ ref: 'PF-1001', proformaRef: 'PF-1001', total: 6_000_000 });
});

describe('RequestFlow', () => {
  it('files the lead through the real API for a signed-in user', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', mobile: '09120000000', name: 'رضا', role: 'customer' },
    });
    const user = userEvent.setup();
    render(<RequestFlow />);

    await user.click(screen.getByRole('button', { name: 'ثبت درخواست پیش‌فاکتور' }));

    expect(createLead).toHaveBeenCalledTimes(1);
    expect(createLead.mock.calls[0]![0]).toMatchObject({
      contact: { name: 'رضا', mobile: '09120000000' },
      items: [{ skuId: 'sku-1', qty: 2, unit: 'branch' }],
      source: 'cart',
    });
    expect(await screen.findByText('درخواست شما به تیم فروش ارسال شد')).toBeInTheDocument();
    // The local-only store must stay empty — it is not a lead channel.
    expect(useRequestsStore.getState().requests).toHaveLength(0);
  });

  it('offers login instead of a submit button to a signed-out visitor, and files nothing locally', async () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    render(<RequestFlow />);

    expect(screen.queryByRole('button', { name: 'ثبت درخواست پیش‌فاکتور' })).not.toBeInTheDocument();
    const login = screen.getByRole('link', { name: 'ورود به حساب کاربری' });
    expect(login).toHaveAttribute('href', expect.stringContaining('/login?next='));

    expect(createLead).not.toHaveBeenCalled();
    expect(useRequestsStore.getState().requests).toHaveLength(0);
    // The cart survives the round trip so the visitor comes back to it.
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('keeps submit disabled until the session has resolved', () => {
    useAuthStore.setState({ status: 'loading', user: null });
    render(<RequestFlow />);

    expect(screen.getByRole('button', { name: 'ثبت درخواست پیش‌فاکتور' })).toBeDisabled();
  });
});
