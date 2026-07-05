import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const isExport = process.env.EXPORT === '1';
// Self-contained server bundle for the optional Docker/VPS path (see web/Dockerfile).
// Off by default, so the Cloudflare (OpenNext) and normal builds are unaffected.
const isStandalone = process.env.BUILD_STANDALONE === '1';
const basePath = process.env.PAGES_BASE_PATH || '';
// `next dev` needs 'unsafe-eval' in its CSP — React/Next use eval() in
// development for HMR and richer error stacks. It is NOT needed (and not
// granted) in production builds. See the CSP header below and
// https://nextjs.org/docs/app/guides/content-security-policy
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pg` (Postgres driver, server/API-route usage — see db/client.ts) as an
  // external so route handlers that import it don't get it bundled by
  // webpack. `pg-cloudflare` (pg's optional Workers-native socket, used via
  // its package.json's "workerd" export condition) needs to be listed here
  // too, not just `pg` itself: @opennextjs/cloudflare's copyWorkerdPackages
  // step only does a full, condition-aware copy of a dependency's workerd
  // build for packages that appear in this list — otherwise it falls back to
  // generic file tracing, which inconsistently drops pg-cloudflare's
  // `dist/index.js`, breaking the Cloudflare Workers build with "Could not
  // resolve pg-cloudflare" (reproduced in CI; see @opennextjs/cloudflare's
  // dist/cli/build/utils/workerd.js).
  serverExternalPackages: ['pg', 'pg-cloudflare', 'ioredis'],
  // `date-fns-jalali` is imported (named imports only) across format/validation/
  // server utils; this keeps only the modules actually used in the bundle
  // instead of Next's default whole-package handling for non-`esm`-optimized
  // libraries.
  experimental: {
    optimizePackageImports: ['date-fns-jalali'],
  },
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
              // crawled/indexed if ever discovered via an external link. These
              // paths are intentionally NOT in robots.ts's `disallow` (except
              // /admin) — see the comment there for why noindex-only (not
              // Disallow+noindex) is the correct pairing.
              source: '/:path(admin|account|request|cart|search|login|styleguide)(.*)',
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
              // This is also the ONLY place these headers are set — a
              // previous version duplicated a subset in middleware.ts, which
              // silently drifted (X-Frame-Options: DENY here vs SAMEORIGIN
              // there). One source of truth now; middleware only does
              // auth-gating.
              source: '/:path*',
              headers: [
                // Stops a response served without an explicit Content-Type
                // (or a wrong one) from being sniffed/executed as something
                // else (e.g. an uploaded/user-influenced response as HTML/JS).
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                // Legacy fallback for browsers that don't honor the CSP
                // `frame-ancestors 'none'` below — DENY covers clickjacking
                // on this single-tenant app (nothing here is meant to be
                // iframed, including by ahantime.com itself).
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
                // Content-Security-Policy — deliberately nonce-free so pages
                // keep static rendering/ISR. A nonce-based CSP forces every
                // route to render dynamically per request (Next.js applies
                // the nonce during SSR, so it can't be baked into a static
                // page — see
                // https://nextjs.org/docs/app/guides/content-security-policy),
                // which would undo this app's ISR strategy across ~250
                // prerendered SKU/blog/tool pages.
                //
                // `script-src` therefore keeps 'unsafe-inline': the Next.js
                // App Router streams its RSC payload and hydration bootstrap
                // as INLINE `<script>self.__next_f.push(...)</script>` tags
                // (~60+ per page, content varying per request), so a strict
                // `script-src 'self'` blocks them all — the browser refuses
                // every inline script, hydration never completes, and the
                // whole app renders a dead, non-interactive loading shell.
                // (Verified directly: reproduced the blocked-hydration
                // failure and the "Refused to execute inline script" console
                // errors, then confirmed 'unsafe-inline' fixes it.) Those
                // inline scripts can't be nonce-free-hashed either — their
                // content is per-request streamed data, so no static hash
                // exists. This matches Next's own "Without Nonces" guidance.
                // Net: still a real improvement over the previous no-CSP
                // baseline (locks script/style/img/font/connect origins to
                // 'self', object-src none, frame-ancestors none, base-uri /
                // form-action self); the residual gap is inline-injection
                // XSS, which React's default output escaping already
                // mitigates since the app renders no user-authored HTML.
                //
                // The per-page JSON-LD `<script type="application/ld+json">`
                // blocks are unaffected regardless: CSP's script-src only
                // gates JavaScript-MIME-type scripts, and application/ld+json
                // is inert data. style-src keeps 'unsafe-inline' for React's
                // `style={{...}}` prop (compiled to inline style attributes
                // across ~40 files).
                {
                  key: 'Content-Security-Policy',
                  value: [
                    "default-src 'self'",
                    scriptSrc,
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data:",
                    "font-src 'self'",
                    "connect-src 'self'",
                    "object-src 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "frame-ancestors 'none'",
                    'upgrade-insecure-requests',
                  ].join('; '),
                },
              ],
            },
          ];
        },
      }),
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);

// Cloudflare (OpenNext) dev binding support. No-op outside `next dev`, and
// only loads the adapter when it's installed, so the GitHub Pages static
// export build (which doesn't need it) is unaffected.
// Also skipped for the standalone Docker/VPS build: initOpenNextCloudflareForDev()
// spawns Cloudflare's `workerd`, a glibc binary that fails with ENOENT on the
// node:20-alpine (musl) build image and aborts `next build`. The Docker path
// doesn't use Cloudflare bindings, so this is safe to skip there.
if (!isExport && !isStandalone) {
  try {
    const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
    initOpenNextCloudflareForDev();
  } catch {
    /* adapter not installed (e.g. static-export CI) — ignore */
  }
}
