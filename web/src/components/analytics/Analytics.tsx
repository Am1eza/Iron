import Script from 'next/script';

/**
 * Config-driven analytics loaders — each activates ONLY when its env id is
 * set, so the site ships zero third-party code until the owner provides ids:
 *
 *  - MATOMO_SITE_ID   → self-hosted Matomo (same-origin /mt/ proxy — works
 *                       inside Iran, no CSP change, primary analytics)
 *  - GTM_ID           → Google Tag Manager (needs CSP origins → rebuild)
 *  - GA4_ID           → GA4 gtag (needs CSP origins → rebuild)
 *
 * Server component: ids are read at runtime from the container env.
 */
export function Analytics() {
  const matomoSiteId = process.env.MATOMO_SITE_ID;
  const gtmId = process.env.GTM_ID;
  const ga4Id = process.env.GA4_ID;

  return (
    <>
      {matomoSiteId ? (
        <Script id="matomo" strategy="afterInteractive">
          {`var _paq = window._paq = window._paq || [];
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
(function() {
  var u='/mt/';
  _paq.push(['setTrackerUrl', u+'matomo.php']);
  _paq.push(['setSiteId', '${matomoSiteId}']);
  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
  g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
})();`}
        </Script>
      ) : null}

      {gtmId ? (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}

      {ga4Id && !gtmId ? (
        // Standalone GA4 (skip when GTM is present — GTM loads GA itself).
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4Id}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}
