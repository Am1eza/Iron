import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderWithIntl as render } from '@/test/renderWithIntl';
import { ArrivalPopup } from './ArrivalPopup';
import { isPromoSuppressedPath } from './arrivalPopupRoutes';
import { useUiStore } from '@/lib/stores/ui';
import faMessages from '../../../messages/fa.json';

// `rerender()` replaces the whole root tree, including whatever provider
// `render()` wrapped it in — so a bare `<ArrivalPopup />` on rerender would
// drop the NextIntlClientProvider `renderWithIntl` mounted and throw once
// the component calls `useTranslations()`. Re-wrap it the same way.
function withIntl(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fa" messages={faMessages} timeZone="Asia/Tehran">
      {ui}
    </NextIntlClientProvider>
  );
}

const pathname = vi.hoisted(() => ({ current: '/prices' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const modalOpen = vi.hoisted(() => ({ current: false }));
vi.mock('@/lib/hooks/useFocusTrap', () => ({ useAnyModalOpen: () => modalOpen.current }));

function becomeEligible() {
  act(() => {
    window.sessionStorage.setItem('ahantime_club_invite_eligible', '1');
    window.dispatchEvent(new CustomEvent('ahantime:club-invite-eligible'));
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
    pathname.current = '/prices';
    modalOpen.current = false;
    useUiStore.setState({ dismissedClubPopupAt: null });
    window.sessionStorage.clear();
  });
  afterEach(() => window.sessionStorage.clear());

  it('never appears on an ordinary first load without proven intent', () => {
    render(<ArrivalPopup />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears after a completed lead or alert marks the session eligible', () => {
    render(<ArrivalPopup />);
    becomeEligible();
    expect(screen.getByRole('status', { name: /باشگاه مشتریان/ })).toBeInTheDocument();
  });

  it('never fires on the cart', () => {
    pathname.current = '/cart';
    render(<ArrivalPopup />);
    becomeEligible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never fires on the login screen, where an OTP field is on the page', () => {
    pathname.current = '/login';
    render(<ArrivalPopup />);
    becomeEligible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides itself when a dialog opens on top of it, and comes back when it closes', () => {
    const { rerender } = render(<ArrivalPopup />);
    becomeEligible();
    expect(screen.getByRole('status')).toBeInTheDocument();

    modalOpen.current = true;
    rerender(withIntl(<ArrivalPopup />));
    expect(screen.queryByRole('status')).toBeNull();

    modalOpen.current = false;
    rerender(withIntl(<ArrivalPopup />));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('hiding on a route change does not burn the 7-day dismissal window', () => {
    const { rerender } = render(<ArrivalPopup />);
    becomeEligible();
    expect(screen.getByRole('status')).toBeInTheDocument();

    pathname.current = '/cart';
    rerender(withIntl(<ArrivalPopup />));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useUiStore.getState().dismissedClubPopupAt).toBeNull();
  });
});
