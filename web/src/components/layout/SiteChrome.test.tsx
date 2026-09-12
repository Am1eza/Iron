/**
 * SiteChrome — which floating widgets are allowed on the advisor page.
 *
 * `/ai`'s composer is fixed to the bottom of the viewport. The callback FAB
 * used to swallow taps meant for the send button there, so SiteChrome still
 * excludes it explicitly on `/ai`. The club promo used to collide with the
 * composer the same way, but that's no longer handled at this level: it
 * suppresses ITSELF by route (`arrivalPopupRoutes.ts`, which includes `/ai`)
 * so SiteChrome doesn't have to keep a second copy of that list — see
 * `ArrivalPopup.test.tsx` / `arrivalPopupRoutes.test` for that behaviour.
 * The mock below is a dumb stub with no route awareness, so from this file's
 * point of view `<ArrivalPopup>` now renders on every path SiteChrome itself
 * doesn't gate.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteChromeBottom } from './SiteChrome';

const pathname = vi.hoisted(() => ({ current: '/' }));
// SiteChrome (and Header.tsx, transitively imported here too) now call
// usePathname from the locale-aware `@/i18n/navigation` wrapper, not
// next/navigation directly. Mocking that module wholesale — rather than
// mocking next/navigation and merging in the real exports, as this used to
// do — is what's needed AND sufficient: it replaces the wrapper before its
// own `createNavigation()` ever runs at module load, so there's no real
// next-intl navigation needing a real intl/App Router context in the first
// place. `Link` is provided too, only so any transitively-imported (but
// never rendered, in the Bottom-only tests below) component that destructures
// it at module scope has a defined binding.
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => pathname.current,
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

  it('excludes the callback FAB on /ai, so nothing can cover the composer', () => {
    renderAt('/ai');
    expect(screen.queryByTestId('callback')).not.toBeInTheDocument();
    // ArrivalPopup is mounted here — this file's stub can't see its own
    // route suppression, which is exactly the point: that logic now lives
    // (and is tested) inside ArrivalPopup itself, not duplicated here.
    expect(screen.getByTestId('arrival')).toBeInTheDocument();
    // The chrome itself must still be there — this is an exclusion, not a bail-out.
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('tabbar')).toBeInTheDocument();
  });

  it('excludes the callback FAB on nested advisor routes too', () => {
    renderAt('/ai/history');
    expect(screen.queryByTestId('callback')).not.toBeInTheDocument();
    expect(screen.getByTestId('arrival')).toBeInTheDocument();
  });

  it('renders nothing at all on the admin shell', () => {
    const { container } = renderAt('/admin/leads');
    expect(container).toBeEmptyDOMElement();
  });
});
