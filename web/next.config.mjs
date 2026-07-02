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
  // webpack. NOTE: this does NOT fix `next dev` — see the KNOWN-ISSUES note
  // in instrumentation.ts; instrumentation.ts has its own compilation unit
  // that doesn't respect this (or a webpack `externals` push, tried and
  // reverted — see git history), a known unresolved Next.js 15.x limitation
  // (vercel/next.js#73179). `next build`/the Cloudflare Workers build are
  // both unaffected — confirmed green.
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
              // Keep admin + personal areas out of search indexes (IA / SEO rules).
              source: '/:path(admin|account|request|cart|search)(.*)',
              headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
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
