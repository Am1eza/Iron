'use client';
import { usePathname } from 'next/navigation';
import { Ticker } from './Ticker';
import { Header } from './Header';
import { Footer } from './Footer';
import type { SiteContact } from '@/lib/server/contact';
import { BottomTabBar } from './BottomTabBar';
import { CallbackWidget } from '@/components/support/CallbackWidget';
// Code-split: the hamburger drawer is only reachable below the 1024px
// breakpoint (and only once opened), and the arrival popup renders `null`
// for its own first 12s by design — neither needs to ship in the shared
// bundle every visitor downloads (see components/lazy.ts).
import { MobileDrawer, ArrivalPopup } from '@/components/lazy';
import type { Category } from '@/lib/types/domain';
import type { SubsMap } from '@/lib/data/catalog';

/**
 * The public storefront chrome — hidden on `/admin/*`, which has its own
 * dedicated shell (`app/admin/layout.tsx`). Without this gate the admin panel
 * rendered a second, nested `<main>` landmark plus the customer nav/cart/AI
 * tab bar stacked around every admin page (WCAG 1.3.1/4.1.2). Split into
 * top/bottom halves so the root layout's single `<main>` stays between them
 * in DOM order.
 */
/**
 * On panel.ahantime.com the storefront chrome must NEVER render — but the
 * pathname check alone can't guarantee that there: middleware rewrites
 * panel paths to /admin/* (and /login → /panel-login) only INTERNALLY, so
 * during SSR usePathname reports the rewritten path (chrome correctly
 * absent from the HTML) while after hydration it reports the browser's
 * original path (/login, /leads, ...) — React then "recovers" by mounting
 * the customer ticker/navbar/footer a few seconds into the page. The
 * hostname check closes that hole: on the client it's authoritative, and
 * during SSR (no window) the rewritten-pathname check already returns null
 * for every panel-host page, so both passes agree and nothing flashes in.
 */
function onPanelHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'panel.ahantime.com';
}

export function SiteChromeTop({ categories, subs }: { categories: Category[]; subs: SubsMap }) {
  const pathname = usePathname();
  if (onPanelHost() || pathname?.startsWith('/admin') || pathname?.startsWith('/panel-login')) return null;
  return (
    <>
      <Ticker />
      <Header categories={categories} subs={subs} />
      <MobileDrawer categories={categories} subs={subs} />
    </>
  );
}

export function SiteChromeBottom({ categories, contact }: { categories: Category[]; contact: SiteContact }) {
  const pathname = usePathname();
  if (onPanelHost() || pathname?.startsWith('/admin') || pathname?.startsWith('/panel-login')) return null;
  return (
    <>
      <Footer categories={categories} contact={contact} />
      <BottomTabBar />
      <ArrivalPopup />
      <CallbackWidget phoneLandline={contact.phoneLandline} />
    </>
  );
}
