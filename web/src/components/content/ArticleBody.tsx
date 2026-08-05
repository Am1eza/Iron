import type { Article } from '@/lib/types/domain';
import { isEmptyDoc, type RichDoc } from '@/lib/content/richDoc';
import { markdownToDoc, blocksToDoc } from '@/lib/content/markdownToDoc';
import { RichContent } from './RichContent';
import { BODIES, type Block } from './legacyBodies';

/**
 * Picks WHICH document an article renders; `RichContent` renders it.
 *
 * Three sources, in strict order of trust:
 *
 *   1. `bodyJson` — the structured body the editor saves. Source of truth.
 *   2. `bodyMd` — the legacy markdown column, converted on the fly by the
 *      SAME parser `scripts/backfillArticleBodyJson.ts` uses. This is what a
 *      row written before US-12.4 (or restored from an older backup) renders
 *      through, and it is why the migration is not a flag day.
 *   3. `BODIES` — the pre-database curated prose, now only a safety net for a
 *      row whose body is empty.
 *
 * The stored body ALWAYS wins over the mock. The old order had
 * `!BODIES[article.slug]` in front of it, and because that map is keyed by the
 * seven slugs that exist in production, the mock won every time: an editor
 * could rewrite an article, watch the admin preview change, save, and the
 * public page never moved.
 */

function fallbackBody(article: Article): Block[] {
  const lead =
    article.excerpt ??
    `در این ${article.type === 'news' ? 'خبر' : 'مطلب'}، به بررسی «${article.title}» می‌پردازیم.`;
  return [
    {
      kind: 'p',
      text: `${lead} در بازار آهن و فولاد، تصمیم درست بیش از هر چیز به اطلاعات به‌روز و شناخت روند قیمت بستگی دارد؛ همان چیزی که در این نوشته به آن می‌پردازیم.`,
    },
    {
      kind: 'p',
      text: 'قیمت مقاطع فولادی هم‌زمان از چند عامل اثر می‌پذیرد: نرخ شمش فولاد، نوسان ارز، حجم عرضه در بورس کالا و تقاضای فصلی پروژه‌های ساختمانی. شناخت این عوامل به خریدار کمک می‌کند فضای بازار را بهتر بخواند و خرید خود را هوشمندانه‌تر برنامه‌ریزی کند.',
    },
    { kind: 'h2', text: 'نکته‌های کلیدی برای خرید آگاهانه' },
    {
      kind: 'ul',
      items: [
        'قیمت لحظه‌ای را پیش از هر سفارش بررسی کنید و به نوسان روزانه توجه داشته باشید.',
        'خرید حجم بالا را در صورت امکان به چند مرحله تقسیم کنید تا ریسک نوسان کم شود.',
        'پیش از تصمیم نهایی، استاندارد و کارخانهٔ سازنده را با نیاز پروژه تطبیق دهید.',
      ],
    },
    {
      kind: 'quote',
      text: 'اول مشورت، بعد خرید؛ یک تصمیم آگاهانه از یک پیش‌بینی خوش‌بینانه ارزشمندتر است.',
    },
    {
      kind: 'p',
      text: 'برای دریافت قیمت روز و راهنمایی متناسب با پروژهٔ خود، قیمت‌های آهن‌تایم را دنبال کنید و با کارشناسان ما در ارتباط باشید.',
    },
  ];
}

/** Resolves an article to the document that should be rendered. Exported so
 *  the admin editor can show exactly what a reader would see for a row it has
 *  not touched yet. */
export function articleDoc(article: Article): RichDoc {
  if (!isEmptyDoc(article.bodyJson)) return article.bodyJson!;
  if (article.bodyMd?.trim()) return markdownToDoc(article.bodyMd);
  return blocksToDoc(BODIES[article.slug] ?? fallbackBody(article));
}

/**
 * The legacy markdown surface, kept because the article-body tests and any
 * caller still holding a markdown string drive it. It renders through the
 * exact same converter + renderer the public page uses, so it cannot show
 * anything the reader would not get.
 */
export function MarkdownProse({ md }: { md: string }) {
  return <RichContent doc={markdownToDoc(md)} />;
}

export function ArticleBody({ article }: { article: Article }) {
  return <RichContent doc={articleDoc(article)} />;
}
