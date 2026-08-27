'use client';
import { usePathname } from 'next/navigation';
import { Ticker } from './Ticker';
import { Header } from './Header';
import { Footer } from './Footer';
import type { SiteContact } from '@/lib/server/contact';
import { BottomTabBar } from './BottomTabBar';
import { CallbackWidget } from '@/components/support/CallbackWidget';
import { isPromoSuppressedPath } from '@/components/club/arrivalPopupRoutes';
// Code-split: the hamburger drawer is only reachable below the 1024px
// breakpoint (and only once opened), and the arrival popup and cart
// reminder both render `null` on most visits by design — none of the three
// need to ship in the shared bundle every visitor downloads (see
// components/lazy.ts).
import { MobileDrawer, ArrivalPopup, CartReminder } from '@/components/lazy';
import type { Category, MarketValue } from '@/lib/types/domain';
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

export function SiteChromeTop({
  categories,
  subs,
  initialMarketValues,
}: {
  categories: Category[];
  subs: SubsMap;
  /** Server-fetched ticker values — see layout.tsx's comment. Undefined on
   *  a DB hiccup; Ticker already has its own zero-value placeholder for that. */
  initialMarketValues?: MarketValue[];
}) {
  const pathname = usePathname();
  if (onPanelHost() || pathname?.startsWith('/admin') || pathname?.startsWith('/panel-login'))
    return null;
  // Same reasoning CartReminder's own suppression check already applies —
  // gating it here too (not just inside the component) means its lazy chunk
  // is never even fetched on a page it would render null on anyway, same
  // pattern SiteChromeBottom already uses for CallbackWidget's `onAdvisor`.
  const suppressCartReminder = isPromoSuppressedPath(pathname);
  return (
    <>
      <Ticker initialValues={initialMarketValues} />
      <Header categories={categories} subs={subs} />
      {!suppressCartReminder && <CartReminder />}
      <MobileDrawer categories={categories} subs={subs} />
    </>
  );
}

export function SiteChromeBottom({
  categories,
  contact,
}: {
  categories: Category[];
  contact: SiteContact;
}) {
  const pathname = usePathname();
  if (onPanelHost() || pathname?.startsWith('/admin') || pathname?.startsWith('/panel-login'))
    return null;
  // /ai's own composer is fixed to the same bottom-inline-end corner as this
  // FAB — on mobile they occupied the exact same pixel box, and the FAB won
  // the stacking order, silently swallowing every tap meant for the chat's
  // send button. The advisor page is itself a live "talk to us" channel, so
  // dropping a second, redundant call CTA there fixes the collision at its
  // root instead of nudging z-index/offsets against a composer this widget
  // has no knowledge of.
  //
  // The FAB is deliberately NOT dropped on /cart, /login or /request the way
  // the club promo now is: it is help, not promotion. A visitor stuck on the
  // OTP screen or unsure about a basket line wants the phone number more
  // there than anywhere else on the site, and it no longer covers anything —
  // it holds the bottom-most floating lane and the toast region and the promo
  // stack above it (see --float-lane-* in tokens.css).
  const onAdvisor = pathname?.startsWith('/ai');
  // Where the promo may appear is the promo's own business — ArrivalPopup
  // suppresses itself by route (arrivalPopupRoutes.ts, which includes /ai) and
  // while any dialog is open. Keeping a second copy of that list here is how
  // the two would drift.
  return (
    <>
      <Footer categories={categories} contact={contact} />
      <BottomTabBar />
      <ArrivalPopup />
      {!onAdvisor && <CallbackWidget phoneLandline={contact.phoneLandline} />}
    </>
  );
}
