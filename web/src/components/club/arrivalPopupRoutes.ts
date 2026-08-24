/**
 * Where the club promo is NOT allowed to appear.
 *
 * The popup fires on a blind 12-second timer with no idea what the visitor is
 * doing, and it is the one thing on the page nobody asked for — so on any
 * surface that IS the visitor's task it must lose. The list is prefix-matched
 * against the pathname:
 *
 *  - `/cart`, `/request` — the conversion funnel itself. An internal promo
 *    covering «ادامه و ثبت درخواست» is the site interrupting its own checkout.
 *  - `/login` — a one-time OTP code arrives by SMS while this card is on
 *    screen; anything that covers the code field costs the login.
 *  - `/account` — the visitor is reading their own requests, alerts and
 *    profile. There is nothing to promote here that they don't already have.
 *  - `/club` — the page the promo links TO. It advertised itself.
 *  - `/ai` — the advisor's own composer is fixed to the same corner and the
 *    12s timer lands almost exactly on the advisor's slow-answer threshold, so
 *    the promo reliably covered the answer as it arrived (see SiteChrome).
 *  - `/admin`, `/panel-login` — the storefront chrome doesn't render there at
 *    all, but the list says so rather than relying on that.
 */
const SUPPRESSED_PREFIXES = [
  '/cart',
  '/request',
  '/login',
  '/account',
  '/club',
  '/ai',
  '/admin',
  '/panel-login',
] as const;

/** True when the club promo must not render for this pathname. */
export function isPromoSuppressedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SUPPRESSED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
