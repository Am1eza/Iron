import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartReminder } from './CartReminder';
import { useCartStore } from '@/lib/stores/cart';
import { useUiStore } from '@/lib/stores/ui';

const pathname = vi.hoisted(() => ({ current: '/prices' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const NOW = new Date('2026-08-27T12:00:00.000Z').getTime();
const TWO_HOURS = 2 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const ITEM = { skuId: 'sku-1', name: 'میلگرد ۱۴ ذوب‌آهن', qty: 100, unit: 'kg' as const, unitPrice: 42_000 };

describe('CartReminder — surfaces a returning visitor’s own pending cart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pathname.current = '/prices';
    useCartStore.setState({ items: [], lastUpdatedAt: null });
    useUiStore.setState({ dismissedCartReminderAt: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden for an empty cart', () => {
    render(<CartReminder />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays hidden while the cart is still fresh — "just added it", not "abandoned"', () => {
    useCartStore.setState({ items: [ITEM], lastUpdatedAt: NOW - 5 * 60 * 1000 });
    render(<CartReminder />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears once the cart has sat untouched past the threshold', () => {
    useCartStore.setState({ items: [ITEM], lastUpdatedAt: NOW - TWO_HOURS - 1000 });
    render(<CartReminder />);
    expect(screen.getByRole('status')).toHaveTextContent('در سبد استعلام شما منتظر است');
  });

  it('never fires on the cart page itself, or other funnel/task pages', () => {
    useCartStore.setState({ items: [ITEM], lastUpdatedAt: NOW - TWO_HOURS - 1000 });
    pathname.current = '/cart';
    render(<CartReminder />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays hidden for 24h after a dismissal, even though the cart is still stale', () => {
    useCartStore.setState({ items: [ITEM], lastUpdatedAt: NOW - TWO_HOURS - 1000 });
    useUiStore.setState({ dismissedCartReminderAt: NOW - 1000 });
    render(<CartReminder />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('comes back once the 24h suppression window has passed', () => {
    useCartStore.setState({ items: [ITEM], lastUpdatedAt: NOW - TWO_HOURS - 1000 });
    useUiStore.setState({ dismissedCartReminderAt: NOW - ONE_DAY - 1000 });
    render(<CartReminder />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('dismissing sets the 24h suppression window, not just this mount’s own state', () => {
    useCartStore.setState({ items: [ITEM], lastUpdatedAt: NOW - TWO_HOURS - 1000 });
    render(<CartReminder />);
    expect(useUiStore.getState().dismissedCartReminderAt).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'بستن' }));

    expect(useUiStore.getState().dismissedCartReminderAt).toBe(NOW);
  });
});
