import Script from 'next/script';

/**
 * Config-driven analytics loaders.
 *
 *  - Matomo   → ALWAYS emits the same <script src="/api/analytics/script">.
 *               That endpoint decides at request time whether it returns the
 *               tracker or an empty file. This indirection is not cosmetic:
 *               nearly every page is prerendered when the image is built, and
 *               MATOMO_SITE_ID only exists at runtime — reading it here meant
 *               "no analytics" was baked into the HTML of every static page
 *               (verified missing on /, /contact, /about, /prices, /market).
 *               Same-origin, so the strict CSP needs no change.
 *  - GTM_ID   → Google Tag Manager (needs CSP origins → rebuild anyway, so
 *  - GA4_ID   → GA4 gtag              the build-time env read is fine here)
 *
 * Server component: the Google ids are read at build/runtime from env.
 */
export function Analytics() {
  const gtmId = process.env.GTM_ID;
  const ga4Id = process.env.GA4_ID;

  return (
    <>
      {/* Always rendered — the endpoint is the switch, not this markup. */}
      <Script src="/api/analytics/script" strategy="afterInteractive" />


      {gtmId ? (
        <>
          <Script id="gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
          {/* Google's own install instructions ask for this immediately after
              <body> for the no-JS fallback; Analytics itself renders lower in
              the tree (see layout.tsx), which is fine — this is a 0x0 pixel,
              not something whose exact DOM position affects behavior. */}
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
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
