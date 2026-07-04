import type { MetadataRoute } from 'next';

// Required for `output: export` (static-only) — see robots.ts/sitemap.ts.
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'آهن‌تایم — بازار هوشمند آهن و فولاد',
    short_name: 'آهن‌تایم',
    description: 'مشاور هوش مصنوعی، قیمت‌های شفاف و لحظه‌ای و زمان تحویل مشخص. اول مشورت، بعد خرید.',
    start_url: '/',
    display: 'standalone',
    background_color: '#171C22',
    theme_color: '#171C22',
    lang: 'fa',
    dir: 'rtl',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon', type: 'image/png', sizes: '180x180' },
    ],
  };
}
