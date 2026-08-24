import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CartView } from './CartView';
import { useCartStore } from '@/lib/stores/cart';
import { useAuthStore } from '@/lib/stores/auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const ITEM = { skuId: 'rebar-14', name: 'میلگرد ۱۴', qty: 1, unit: 'kg' as const, unitPrice: 35_000 };

describe('CartView — explicit login requirement on the checkout CTA (US-P0.4)', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [ITEM] });
    useAuthStore.setState({ user: null, status: 'loading' });
  });

  it('tells a guest the next step is signing in', async () => {
    useAuthStore.setState({ user: null, status: 'anonymous' });
    await act(async () => {
      render(<CartView />);
    });
    expect(await screen.findByRole('link', { name: /ورود و ادامه ثبت درخواست/ })).toBeInTheDocument();
  });

  it('keeps the plain CTA for an already-signed-in visitor', async () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '09120000000', role: 'customer' },
      status: 'authenticated',
    });
    await act(async () => {
      render(<CartView />);
    });
    expect(await screen.findByRole('link', { name: 'ادامه و ثبت درخواست' })).toBeInTheDocument();
    expect(screen.queryByText(/ورود و ادامه/)).toBeNull();
  });
});
