/**
 * SiteChrome — which floating widgets are allowed on the advisor page.
 *
 * `/ai`'s composer is fixed to the bottom of the viewport. Anything else that
 * pins itself to a bottom corner lands on top of it: the callback FAB used to
 * swallow taps meant for the send button, and the club promo — which fires on
 * a 12s timer, i.e. while the visitor is waiting for a price — covered the
 * whole composer at 375px. Both are excluded there; everywhere else both
 * still render.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteChromeBottom } from './SiteChrome';

const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

vi.mock('./Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock('./BottomTabBar', () => ({ BottomTabBar: () => <nav data-testid="tabbar" /> }));
vi.mock('@/components/support/CallbackWidget', () => ({
  CallbackWidget: () => <div data-testid="callback" />,
}));
vi.mock('@/components/lazy', () => ({
  MobileDrawer: () => null,
  ArrivalPopup: () => <div data-testid="arrival" />,
}));

const contact = { phoneLandline: '021-000' } as never;
const renderAt = (path: string) => {
  pathname.current = path;
  return render(<SiteChromeBottom categories={[]} contact={contact} />);
};

describe('SiteChromeBottom — bottom-corner widgets vs the advisor composer', () => {
  it('renders both floating widgets on an ordinary page', () => {
    renderAt('/prices');
    expect(screen.getByTestId('arrival')).toBeInTheDocument();
    expect(screen.getByTestId('callback')).toBeInTheDocument();
  });

  it('renders neither on /ai, so nothing can cover the composer', () => {
    renderAt('/ai');
    expect(screen.queryByTestId('arrival')).not.toBeInTheDocument();
    expect(screen.queryByTestId('callback')).not.toBeInTheDocument();
    // The chrome itself must still be there — this is an exclusion, not a bail-out.
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('tabbar')).toBeInTheDocument();
  });

  it('excludes them on nested advisor routes too', () => {
    renderAt('/ai/history');
    expect(screen.queryByTestId('arrival')).not.toBeInTheDocument();
    expect(screen.queryByTestId('callback')).not.toBeInTheDocument();
  });

  it('renders nothing at all on the admin shell', () => {
    const { container } = renderAt('/admin/leads');
    expect(container).toBeEmptyDOMElement();
  });
});
