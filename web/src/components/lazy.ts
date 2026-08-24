'use client';
import dynamic from 'next/dynamic';

/**
 * Client components that are only needed on interaction (a click, a hamburger
 * open, a chart request) rather than on first paint — deferred with
 * `next/dynamic` so their code isn't in the initial/shared bundle every
 * visitor downloads. These are client-only UI (no SEO-relevant content), so
 * `ssr: false` costs nothing and skips server-rendering a shell for them.
 *
 * «محصولات» (ProductsMenu) used to be listed here and is NOT any more. The
 * premise above was wrong for it: its panel is the site's whole product
 * taxonomy, ~90 internal links with Persian product names as anchor text, and
 * `ssr: false` meant not one of them appeared in any page's HTML. It is now
 * imported directly by Header and server-rendered. See its own file header.
 */

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

/** کیلوگرم quantity step — only rendered once a kg-basis product's
 *  «افزودن به سبد» is actually clicked (PriceTable, SkuDetail). Bundles its
 *  own `Modal` import rather than reusing the lazy one above, since both
 *  only ever load together anyway. */
export const KgQuantityModal = dynamic(
  () => import('./cart/KgQuantityModal').then((m) => m.KgQuantityModal),
  { ssr: false },
);
