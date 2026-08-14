import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Heading,
  Text,
  Overline,
  Breadcrumbs,
} from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { MarketBoard } from '@/components/market/MarketBoard';
import { getArticle } from '@/lib/server/catalog';
import { ArticleCard } from '@/components/content/ArticleCard';
import styles from './page.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'طلا، ارز و شمش فولاد',
  description:
    'نرخ لحظه‌ای دلار، یورو، طلای ۱۸ عیار، انس جهانی و شمش فولاد در آهن‌تایم: همان متغیرهایی که قیمت روز آهن‌آلات را جابه‌جا می‌کنند.',
  path: routes.market(),
});

// Category list is admin-curated and rarely changes, but without a revalidate
// window this page would otherwise cache forever after build (no
// revalidatePath call exists for category admin writes yet).
export const revalidate = 300;

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'طلا، ارز و شمش' },
];

/** The one published article that actually walks through how دلار moves a
 *  finished-product price (سازوکار قیمت ورق) — closest existing match to
 *  this page's own subject until a piece written specifically for the
 *  دلار/طلا/شمش board itself exists. Missing in mock mode / a fresh DB is a
 *  normal state, not an error, so the section below just doesn't render. */
const RELATED_ARTICLE_SLUG = 'عوامل-موثر-بر-قیمت-ورق-فولادی';

export default async function MarketPage() {
  const relatedArticle = await getArticle(RELATED_ARTICLE_SLUG);

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10}>
        <Stack gap={8}>
          <Stack gap={3}>
            <Breadcrumbs items={crumbs} />
            <Overline>نبض بازار</Overline>
            <Heading level={1} id="market-title">
              طلا، ارز و شمش فولاد
            </Heading>
            <Text color="muted" variant="body-lg">
              قیمت آهن‌آلات روی هواست؛ موتور آن دلار، نرخ شمش و بهای جهانی فولاد است. وقتی دلار
              بالا می‌رود، میلگرد و تیرآهن هم دیر یا زود همان مسیر را می‌روند. این صفحه برای همان
              کسانی است که هر روز نرخ دلار را چک می‌کنند. اینجا یک قدم جلوتر، تأثیرش بر بازار آهن را
              هم می‌بینید. اول مشورت، بعد خرید.
            </Text>
          </Stack>

          <MarketBoard />

          <Stack gap={5} className={styles.explainer}>
            <Heading level={2} id="market-why-title">
              دلار و طلا چطور روی قیمت آهن‌آلات اثر می‌گذارند؟
            </Heading>
            <Text color="muted">
              بیشتر خریداران آهن فکر می‌کنند قیمت میلگرد و تیرآهن را فقط کارخانه‌های داخلی تعیین
              می‌کنند، اما واقعیت پیچیده‌تر است. مادهٔ اولیهٔ اصلی فولاد، یعنی شمش، در بورس کالای
              ایران قیمت‌گذاری می‌شود و همان بورس هم مستقیم به نرخ ارز واکنش نشان می‌دهد. وقتی دلار
              بالا می‌رود، هزینهٔ سنگ‌آهن و قراضهٔ وارداتی برای کارخانه‌ها گران‌تر می‌شود و این هزینه
              دیر یا زود روی قیمت محصول نهایی می‌نشیند.
            </Text>
            <Text color="muted">
              انس جهانی طلا را هم خیلی‌ها بی‌ربط به آهن می‌دانند، ولی در عمل یک کارکرد مهم دارد:
              وقتی نگرانی از تورم یا بی‌ثباتی اقتصادی جهانی بالا می‌رود، طلا و فلزات پایه مثل آهن و
              مس معمولاً با هم گران می‌شوند، چون هر دو در دستهٔ دارایی فیزیکی قرار می‌گیرند که سرمایه
              در شرایط بحرانی به آن پناه می‌برد.
            </Text>
            <Text color="muted">
              به همین دلیل این صفحه دلار، یورو، طلای ۱۸ عیار، انس جهانی و نرخ کارشناسی شمش را کنار
              هم نشان می‌دهد. برای فهمیدن مسیر فردای قیمت آهن، اول باید همین چهار متغیر را زیر نظر
              گرفت، نه فقط نرخ خود میلگرد را.
            </Text>
          </Stack>

          {relatedArticle ? (
            <section className={styles.related} aria-labelledby="market-related-title">
              <h2 id="market-related-title" className={styles.relatedTitle}>
                مطالعهٔ بیشتر
              </h2>
              <ul className={styles.relatedGrid}>
                <ArticleCard article={relatedArticle} />
              </ul>
            </section>
          ) : null}
        </Stack>
      </Section>
    </Container>
  );
}
