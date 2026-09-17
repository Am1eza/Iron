import Script from 'next/script';

/**
 * Consent Mode v2 region list — every country where a consent banner is
 * legally required before analytics/ads storage. Codes are ISO 3166-1
 * alpha-2 (plus EU member states), the format `gtag('consent', 'default')`
 * expects in `region`.
 */
const EEA_UK_CH = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH',
];

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
          {/*
            `beforeInteractive`, not `afterInteractive`. Measured on the live
            site: the GA4 `page_view` hit carried `tfd=20598` — the tag fired
            20.6 s after navigation started, because `afterInteractive` waits
            for hydration of a ~1.2 MB price page. Every visitor who left
            before that was never counted (GA4 saw 268 sessions over the same
            period Matomo saw 604). The snippet itself only appends an async
            <script>, so running it early costs no render-blocking work.

            Consent Mode v2 defaults are declared in the SAME script, before
            the container loads, which is the only order Google accepts: a
            default declared after gtm.js has already fired is ignored and the
            hit ships with `gcd=...l1l1` (unset), which is what production was
            sending. Iran — the site's market — has no consent-banner regime,
            so storage is granted by default; the EEA/UK/CH list is denied
            until a banner grants it, so a European visitor is modelled rather
            than tracked.

            The panel host is excluded here rather than by a GA4 data filter:
            `panel.ahantime.com` is the same container and was reporting
            /admin/content, /admin/catalog and /login as landing pages —
            staff sessions inside the customer numbers.
          */}
          <Script id="gtm-consent-and-loader" strategy="beforeInteractive">
            {`(function(w,d,s,l,i){
  if (/^panel\./.test(location.hostname)) return;
  w[l]=w[l]||[];
  // The gtag command queue, defined here rather than by gtag.js, so page code
  // can call gtag('event', …) before the container finishes loading — the
  // calls queue in the same dataLayer and are replayed when it does.
  w.gtag=w.gtag||function(){w[l].push(arguments);};
  var gtag=w.gtag;
  gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500,region:${JSON.stringify(EEA_UK_CH)}});
  gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
  w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
  var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
  f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
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
