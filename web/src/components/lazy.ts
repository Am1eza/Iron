'use client';
import dynamic from 'next/dynamic';

/**
 * Client components that are only needed on interaction (a click, a hamburger
 * open, a chart request) rather than on first paint — deferred with
 * `next/dynamic` so their code isn't in the initial/shared bundle every
 * visitor downloads. All three are client-only UI (no SEO-relevant content),
 * so `ssr: false` costs nothing and skips server-rendering a shell for them.
 */

/** «محصولات» desktop mega-menu — opens on hover/click, never on first paint. */
export const ProductsMenu = dynamic(
  () => import('./layout/ProductsMenu').then((m) => m.ProductsMenu),
  { ssr: false },
);

/** Mobile hamburger drawer — only reachable below the 1024px breakpoint, and
 *  only once opened; desktop visitors never trigger it. */
export const MobileDrawer = dynamic(
  () => import('./layout/MobileDrawer').then((m) => m.MobileDrawer),
  { ssr: false },
);

/** First-visit arrival popup — renders `null` for its own first 12s by
 *  design, so there's no reason its code needs to ship with the initial
 *  bundle. */
export const ArrivalPopup = dynamic(
  () => import('./club/ArrivalPopup').then((m) => m.ArrivalPopup),
  { ssr: false },
);

/** Generic modal shell — only mounted once something is actually open
 *  (a price chart, an export menu, a confirmation dialog). */
export const Modal = dynamic(() => import('./ui/Modal').then((m) => m.Modal), { ssr: false });

/** Price history chart — only rendered inside the datasheet's «نمودار» modal. */
export const PriceChart = dynamic(() => import('./catalog/PriceChart').then((m) => m.PriceChart), {
  ssr: false,
});
