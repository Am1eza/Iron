import { NextResponse } from 'next/server';

/**
 * GET /api/analytics/script — the Matomo tracker bootstrap, served at RUNTIME.
 *
 * Why an endpoint instead of an inline <script> in the layout: almost every
 * page here is prerendered when the Docker image is built, and MATOMO_SITE_ID
 * is a runtime environment variable that does not exist in CI. A server
 * component that renders the snippet conditionally therefore baked "no
 * analytics" into the HTML of every static page — measured on the live site,
 * the tracker was missing from /, /contact, /about, /prices and /market; only
 * pages that happened to re-render on the server ever carried it.
 *
 * The page markup now always contains the same <script src> (safe to
 * prerender), and this route decides at request time whether it returns the
 * tracker or an empty file. Nothing third-party ships until the owner sets an
 * id — which was the point of the env gate in the first place.
 *
 * Same-origin, so the strict CSP (`script-src 'self'`) needs no change, and
 * the tracker itself is proxied at /mt/ (see the Caddyfile) — no request ever
 * leaves this domain.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const siteId = process.env.MATOMO_SITE_ID;
  const body = siteId
    ? `(function(){
  var _paq = window._paq = window._paq || [];
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  var u = '/mt/';
  _paq.push(['setTrackerUrl', u + 'matomo.php']);
  _paq.push(['setSiteId', ${JSON.stringify(String(siteId))}]);
  var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
  g.async = true; g.src = u + 'matomo.js';
  s.parentNode.insertBefore(g, s);
})();`
    : '/* analytics disabled: MATOMO_SITE_ID is not set */';

  return new NextResponse(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // Short cache: the id changes about never, but a stale "disabled" file
      // must not outlive the owner turning analytics on.
      'cache-control': 'public, max-age=300',
    },
  });
}
