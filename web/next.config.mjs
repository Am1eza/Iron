/** @type {import('next').NextConfig} */
const isExport = process.env.EXPORT === '1';
const basePath = process.env.PAGES_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Static export for GitHub Pages (preview). `next start`/dev keep full SSR.
  ...(isExport
    ? { output: 'export', trailingSlash: true, basePath, assetPrefix: basePath || undefined }
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
              source: '/:path(admin|حساب|درخواست|سبد-استعلام|جستجو)(.*)',
              headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
            },
          ];
        },
      }),
};

export default nextConfig;
