/**
 * Market-news topics (اخبار بازار) — a fixed, curated taxonomy distinct
 * from the DB-backed product categories (`categories` table, میلگرد/ورق/…).
 *
 * Why fixed in code and not a DB table like `categories`:
 * a product category can grow (a new SKU category the admin adds), but a
 * news topic is an editorial lens on the STEEL MARKET ITSELF, not on the
 * catalog — it does not grow when the catalog does, and the non-technical
 * admin (see `ContentQueue.tsx`'s `CategoryField` comment on the same
 * reasoning) must never be asked to invent or manage one. Same pattern as
 * `TOOL_SLUGS`/`COOPERATION_TRACKS` in `routes.ts`.
 *
 * Why a news article can ALSO carry product categories (`relatedCategoryIds`)
 * at the same time: those still feed the combined product page
 * (`/blog/category/[slug]`, spanning blog+news — see `articleSlug.ts`'s
 * sibling reasoning in `ContentQueue.tsx`), which answers "what's written
 * about میلگرد" regardless of form. Topics answer a different question —
 * "what KIND of market news is this" — that product categories cannot: a
 * تعرفه/policy story affects every product at once and belongs to no single
 * category, and `/news` itself has always been product-category-free by
 * deliberate, documented design (see `ArticleIndex.tsx`).
 *
 * Chosen from what Iranian steel-market news actually splits into —
 * cross-checked against foolad24.com (روزانه بورس‌کالا/عرضه — rates),
 * ahan-news.com (کارخانه/تولید stories), and this project's own three seed
 * news articles (production record, export-billet rate, construction
 * demand) — rather than invented. Kept small and mutually exclusive by
 * design: a currency-driven price move is «نرخ‌ها», not a new «اقتصاد کلان»
 * bucket, and a policy story is about the RULE, not the trade it enables
 * (`صادرات و واردات`).
 */
export const NEWS_TOPICS = [
  {
    slug: 'rates-exchange',
    name: 'نرخ‌ها و بورس کالا',
    description: 'تغییرات نرخ محصولات و عرضه‌های روزانهٔ بورس کالای ایران.',
  },
  {
    slug: 'production-mills',
    name: 'تولید و کارخانه‌ها',
    description: 'رکوردهای تولید، ظرفیت و رویدادهای کارخانه‌های فولادی.',
  },
  {
    slug: 'trade',
    name: 'صادرات و واردات',
    description: 'روند و حجم تجارت خارجی آهن و فولاد.',
  },
  {
    slug: 'policy-regulation',
    name: 'سیاست‌گذاری و مقررات',
    description: 'تصمیمات دولتی، تعرفه‌ها و قوانین اثرگذار بر بازار.',
  },
  {
    slug: 'global-market',
    name: 'تحولات بازار جهانی',
    description: 'قیمت و تحولات بازارهای جهانی فولاد و اثر آن بر بازار داخلی.',
  },
  {
    slug: 'demand-construction',
    name: 'تقاضا و ساخت‌وساز',
    description: 'روند تقاضا در بخش ساختمان و پروژه‌های عمرانی.',
  },
] as const;

export type NewsTopicSlug = (typeof NEWS_TOPICS)[number]['slug'];

export function findNewsTopic(slug: string) {
  return NEWS_TOPICS.find((t) => t.slug === slug);
}
