/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // production Docker image stays small — see Dockerfile / DEPLOY.md.
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Persian-first, RTL is handled in <html dir="rtl" lang="fa"> (root layout),
  // not via next/i18n (which is Pages-router only). /en, /ar reserved for later.
  async headers() {
    return [
      {
        // Keep admin + personal areas out of search indexes (IA / SEO rules).
        source: '/:path(admin|account|request|cart|search)(.*)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
