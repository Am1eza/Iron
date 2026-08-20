import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getSubsMap } from '@/lib/data/catalog';
import { getRows, getHeadlineRows } from '@/lib/server/catalog';
import { itemListJsonLd, catalogNavigationJsonLd } from '@/lib/seo';
import { Container, Section, Stack, Heading, Text, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { CategoryGrid } from '@/components/market/CategoryGrid';
import { CategoryPriceSummary } from '@/components/market/CategoryPriceSummary';
import { FeaturedPrices } from '@/components/market/FeaturedPrices';
import { ArticleFaq } from '@/components/content/ArticleFaq';

export const metadata: Metadata = buildMetadata({
  title: 'قیمت روز آهن و فولاد',
  description: 'قیمت روز میلگرد، تیرآهن، پروفیل، ورق و سایر مقاطع فولادی در آهن‌تایم.',
  path: routes.prices(),
});

// Category list is admin-curated and rarely changes, but without a revalidate
// window this page would otherwise cache forever after build (no
// revalidatePath call exists for category admin writes yet).
export const revalidate = 300;

const crumbs = [{ label: 'خانه', href: routes.home() }, { label: 'قیمت‌ها' }];

/** Answers the questions a visitor arriving on «قیمت روز آهن» actually asks
 *  next. Each answer stands alone — FAQPage entries are quoted out of page
 *  context by Google's "People also ask" and AI Overviews. Deliberately
 *  free of dated numbers: the live figures are in the table above and must
 *  never be duplicated into text that can silently go stale. */
const FAQ_ITEMS = [
  {
    question: 'قیمت روز آهن‌آلات در آهن‌تایم چطور تعیین می‌شود؟',
    answer:
      'هر نرخ را کارشناسان آهن‌تایم پس از استعلام از کارخانه و بازار به‌صورت دستی ثبت می‌کنند؛ هیچ عددی از روی فرمول یا نرخ بورس به‌صورت خودکار ساخته نمی‌شود. تاریخ و ساعت آخرین به‌روزرسانی روی هر جدول درج شده و اگر نرخی کهنه شود، به‌جای نمایش عدد قدیمی، «تماس بگیرید» نشان داده می‌شود.',
  },
  {
    question: 'قیمت‌های نمایش‌داده‌شده شامل ارزش افزوده است؟',
    answer:
      'خیر. همهٔ قیمت‌های منتشرشده در آهن‌تایم بدون احتساب مالیات بر ارزش افزوده و بر مبنای کیلوگرم اعلام می‌شوند. مبلغ ارزش افزوده و هزینهٔ حمل در پیش‌فاکتور رسمی به‌صورت جداگانه محاسبه و اضافه می‌شود.',
  },
  {
    question: 'چرا قیمت میلگرد امروز با دیروز فرق دارد؟',
    answer:
      'قیمت مقاطع فولادی تابع نرخ شمش، دلار و میزان عرضهٔ کارخانه‌هاست و این متغیرها روزانه تغییر می‌کنند. ستون «نوسان» در جدول‌های آهن‌تایم دقیقاً همین تغییر نسبت به آخرین نرخ ثبت‌شده را نشان می‌دهد.',
  },
  {
    question: 'برای خرید باید آنلاین پرداخت کنم؟',
    answer:
      'خیر. در آهن‌تایم پرداخت آنلاین وجود ندارد. شما محصول موردنظر را انتخاب و درخواست پیش‌فاکتور ثبت می‌کنید، سپس کارشناس فروش تماس می‌گیرد، موجودی و زمان تحویل را تأیید می‌کند و خرید به‌صورت انسانی نهایی می‌شود.',
  },
  {
    question: 'قیمت اعلام‌شده تا چه زمانی معتبر است؟',
    answer:
      'نرخ‌های سایت مرجع لحظه‌ای بازارند و با تغییر بازار به‌روز می‌شوند. نرخ قطعی و تعهدآور همان چیزی است که در پیش‌فاکتور صادرشده درج می‌شود و اعتبار آن در خود پیش‌فاکتور مشخص شده است.',
  },
];

export default async function PriceHubPage() {
  const [categories, subs, headlineRows, rebarAll] = await Promise.all([
    getCategories(),
    getSubsMap(),
    getHeadlineRows(),
    getRows('rebar'),
  ]);
  // Same headline row count the previous mock fixture happened to show.
  const rebarRows = rebarAll.slice(0, 6);
  // The catalog taxonomy as structured data — see catalogNavigationJsonLd.
  // This hub and the homepage are the two URLs an answer engine lands on to
  // work out what آهن‌تایم sells; it is not published site-wide.
  const catalogNav = catalogNavigationJsonLd(categories, subs);
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      {catalogNav ? <JsonLd data={catalogNav} /> : null}
      {headlineRows.length > 0 ? (
        <JsonLd
          data={itemListJsonLd(
            headlineRows.map((r) => ({
              name: r.name,
              url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
            })),
          )}
        />
      ) : null}
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <Heading level={1}>قیمت روز آهن و فولاد</Heading>
            <Text color="muted" variant="body-lg">
              قیمت شاخص هر دستهٔ آهن‌آلات — از میلگرد و تیرآهن تا ورق، پروفیل و لوله — در یک جدول
              جمع شده است. همهٔ نرخ‌ها را کارشناسان آهن‌تایم دستی و پس از استعلام از کارخانه ثبت
              می‌کنند، بدون ارزش افزوده و بر مبنای کیلوگرم؛ برای دیدن همهٔ سایزها و کارخانه‌های یک
              دسته، وارد جدول کامل همان دسته شوید.
            </Text>
          </div>
          <CategoryPriceSummary rows={headlineRows} categories={categories} />
          <CategoryGrid categories={categories} subs={subs} />
          <FeaturedPrices rows={rebarRows} />
          <ArticleFaq items={FAQ_ITEMS} />
        </Stack>
      </Section>
    </Container>
  );
}
