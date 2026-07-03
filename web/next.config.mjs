/** @type {import('next').NextConfig} */
const isExport = process.env.EXPORT === '1';
// Self-contained server bundle for the optional Docker/VPS path (see web/Dockerfile).
// Off by default, so the Cloudflare (OpenNext) and normal builds are unaffected.
const isStandalone = process.env.BUILD_STANDALONE === '1';
const basePath = process.env.PAGES_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pg` (Postgres driver, server/API-route usage — see db/client.ts) as an
  // external so route handlers that import it don't get it bundled by
  // webpack.
  serverExternalPackages: ['pg'],
  // Static export for GitHub Pages (preview). `next start`/dev keep full SSR.
  ...(isExport
    ? { output: 'export', trailingSlash: true, basePath, assetPrefix: basePath || undefined }
    : isStandalone
      ? { output: 'standalone' }
      : {}),
  images: {
    formats: ['image/avif', 'image/webp'],
    ...(isExport ? { unoptimized: true } : {}),
  },
  // Persian-first, RTL is handled in <html dir="rtl" lang="fa"> (root layout),
  // not via next/i18n (which is Pages-router only). /en, /ar reserved for later.
  // headers() is not supported by `output: export`, so skip it in that mode.
  ...(isExport
    ? {}
    : {
        async headers() {
          return [
            {
              // Keep admin, personal, and internal-tooling areas out of search
              // indexes (IA / SEO rules). styleguide is an internal component
              // reference — not customer-facing, not in sitemap.ts, and never
              // linked from the site, but with no noindex it would still get
              // crawled/indexed if ever discovered via an external link.
              source: '/:path(admin|account|request|cart|search|styleguide)(.*)',
              headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
            },
            {
              // Sitewide baseline security headers. Neither deployment path
              // adds these on its own: the Caddyfile (Docker path) only
              // terminates TLS + reverse-proxies (no header injection), and
              // Cloudflare's edge (Workers path) does not add response
              // security headers to origin/Worker responses either — both
              // must come from the app itself.
              //
              // Content-Security-Policy is deliberately NOT set here yet: the
              // app has legitimate inline <script> tags (ThemeScript's FOUC
              // guard, per-page JSON-LD with per-request dynamic content), so
              // a correct CSP needs per-request nonces wired through
              // middleware — a larger, separately-tested change, not a
              // same-breath addition to this static header list.
              source: '/:path*',
              headers: [
                // Stops a response served without an explicit Content-Type
                // (or a wrong one) from being sniffed/executed as something
                // else (e.g. an uploaded/user-influenced response as HTML/JS).
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                // No legacy browser needs X-Frame-Options given the CSP gap
                // above isn't providing frame-ancestors yet — DENY covers
                // clickjacking on this single-tenant app (nothing here is
                // meant to be iframed, including by ahantime.com itself).
                { key: 'X-Frame-Options', value: 'DENY' },
                // Full URL leaks to third-party destinations (analytics
                // scripts, outbound links) only on same-origin navigations;
                // cross-origin gets origin-only, same-origin gets the full
                // referrer — good default for a site with account/order refs
                // in some paths.
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                // Deny browser-feature access this app never uses; nothing
                // here needs camera/mic/geolocation/payment/USB from the
                // browser (the AI advisor and pricing tools are all
                // server-computed, not client-hardware-driven).
                {
                  key: 'Permissions-Policy',
                  value:
                    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
                },
                // Safe to set at the app layer even though both Caddy and
                // Cloudflare terminate TLS in front — HSTS is a per-origin
                // browser instruction, not a proxy concern, and is additive
                // with any zone-level HSTS Cloudflare is separately
                // configured with. 1 year + subdomains, no preload (preload
                // is a one-way door requiring explicit opt-in submission).
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;

// Cloudflare (OpenNext) dev binding support. No-op outside `next dev`, and
// only loads the adapter when it's installed, so the GitHub Pages static
// export build (which doesn't need it) is unaffected.
if (!isExport) {
  try {
    const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
    initOpenNextCloudflareForDev();
  } catch {
    /* adapter not installed (e.g. static-export CI) — ignore */
  }
}
