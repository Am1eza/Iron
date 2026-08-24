import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ArrivalPopup } from './ArrivalPopup';
import { isPromoSuppressedPath } from './arrivalPopupRoutes';
import { useUiStore } from '@/lib/stores/ui';

const pathname = vi.hoisted(() => ({ current: '/prices' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const modalOpen = vi.hoisted(() => ({ current: false }));
vi.mock('@/lib/hooks/useFocusTrap', () => ({ useAnyModalOpen: () => modalOpen.current }));

/** Past the 12s reveal timer. */
function advancePastReveal() {
  act(() => {
    vi.advanceTimersByTime(13_000);
  });
}

describe('isPromoSuppressedPath', () => {
  it('suppresses the funnel, login, the account area, the club page and the advisor', () => {
    for (const p of ['/cart', '/request', '/login', '/account', '/club', '/ai']) {
      expect(isPromoSuppressedPath(p)).toBe(true);
    }
  });

  it('matches nested paths but not merely prefixed ones', () => {
    expect(isPromoSuppressedPath('/account/requests')).toBe(true);
    expect(isPromoSuppressedPath('/cartography')).toBe(false);
    expect(isPromoSuppressedPath('/prices/rebar')).toBe(false);
  });
});

describe('ArrivalPopup — a promo that never outranks the visitor’s task', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pathname.current = '/prices';
    modalOpen.current = false;
    useUiStore.setState({ dismissedClubPopupAt: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appears on an ordinary page once the timer fires', () => {
    render(<ArrivalPopup />);
    advancePastReveal();
    expect(screen.getByRole('status', { name: /باشگاه مشتریان/ })).toBeInTheDocument();
  });

  it('never fires on the cart', () => {
    pathname.current = '/cart';
    render(<ArrivalPopup />);
    advancePastReveal();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never fires on the login screen, where an OTP field is on the page', () => {
    pathname.current = '/login';
    render(<ArrivalPopup />);
    advancePastReveal();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides itself when a dialog opens on top of it, and comes back when it closes', () => {
    const { rerender } = render(<ArrivalPopup />);
    advancePastReveal();
    expect(screen.getByRole('status')).toBeInTheDocument();

    modalOpen.current = true;
    rerender(<ArrivalPopup />);
    expect(screen.queryByRole('status')).toBeNull();

    modalOpen.current = false;
    rerender(<ArrivalPopup />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hiding on a route change does not burn the 7-day dismissal window', () => {
    const { rerender } = render(<ArrivalPopup />);
    advancePastReveal();
    expect(screen.getByRole('status')).toBeInTheDocument();

    pathname.current = '/cart';
    rerender(<ArrivalPopup />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(useUiStore.getState().dismissedClubPopupAt).toBeNull();
  });
});
