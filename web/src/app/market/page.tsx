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
  Card,
} from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { MarketBoard } from '@/components/market/MarketBoard';
import { getArticle } from '@/lib/server/catalog';
import { ArticleCard } from '@/components/content/ArticleCard';
import { ArticleFaq } from '@/components/content/ArticleFaq';
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
  { label: 'طلا، ارز و شمش', href: routes.market() },
];

/** The one published article that actually walks through how دلار moves a
 *  finished-product price (سازوکار قیمت ورق) — closest existing match to
 *  this page's own subject until a piece written specifically for the
 *  دلار/طلا/شمش board itself exists. Missing in mock mode / a fresh DB is a
 *  normal state, not an error, so the section below just doesn't render. */
const RELATED_ARTICLE_SLUG = 'عوامل-موثر-بر-قیمت-ورق-فولادی';

/**
 * The ROLE each market variable plays in the finished-آهن price — timeless
 * explanatory content, deliberately NOT dated price numbers. Live rates live
 * in the board above (نبض بازار); this table exists so the *why* is
 * self-contained and extractable, and can never quietly go stale or drift
 * away from the live board. شمش فولاد is included now that it carries a real
 * entered rate (2026-08-16), as the most direct driver of میلگرد/تیرآهن.
 */
const ROLE_ROWS = [
  { label: 'دلار', role: 'هزینهٔ دلاریِ سنگ‌آهن و قراضهٔ وارداتیِ کارخانه‌ها' },
  { label: 'یورو', role: 'اثر غیرمستقیم، عمدتاً ماشین‌آلات و مواد اولیهٔ اروپایی' },
  { label: 'طلای ۱۸ عیار', role: 'بازتاب داخلیِ قیمت جهانی طلا و نرخ دلار' },
  { label: 'انس جهانی طلا', role: 'شاخص ریسک‌گریزی و تورم در اقتصاد جهانی' },
  { label: 'شمش فولاد', role: 'مادهٔ اولیهٔ اصلی و مستقیم‌ترین محرک قیمت میلگرد و تیرآهن' },
];

const FAQ_ITEMS = [
  {
    question: 'چرا وقتی دلار بالا می‌رود، قیمت میلگرد هم بالا می‌رود؟',
    answer:
      'چون شمش فولاد، مادهٔ اولیهٔ اصلی میلگرد، در بورس کالای ایران بر پایهٔ هزینهٔ دلاریِ سنگ‌آهن و قراضهٔ وارداتی قیمت‌گذاری می‌شود. گران‌شدن دلار این هزینه را برای کارخانه‌ها بالا می‌برد و معمولاً ظرف چند هفته روی قیمت نهایی میلگرد و تیرآهن اثر می‌گذارد.',
  },
  {
    question: 'انس جهانی طلا چه ربطی به قیمت آهن دارد؟',
    answer:
      'وقتی نگرانی از تورم یا بی‌ثباتی اقتصاد جهانی بالا می‌رود، سرمایه معمولاً هم‌زمان به طلا و فلزات پایه مثل آهن و مس پناه می‌برد، چون هر دو دارایی فیزیکی محسوب می‌شوند. به همین دلیل انس جهانی و قیمت جهانی فولاد در بازه‌های پرتلاطم اغلب هم‌جهت حرکت می‌کنند.',
  },
  {
    question: 'اگر امروز دلار بالا برود، قیمت میلگرد همان روز عوض می‌شود؟',
    answer:
      'نه معمولاً. کارخانه‌ها قیمت را بر پایهٔ نرخ چند روز اخیر تنظیم می‌کنند، نه لحظه‌ای، و موجودی انبار یا قراردادهای از پیش‌بسته‌شده هم می‌تواند این اثر را چند روز تا چند هفته عقب بیندازد. رابطهٔ دلار و قیمت آهن هم‌جهت است، اما هم‌زمان نیست.',
  },
  {
    question: 'یورو هم مثل دلار روی قیمت آهن اثر می‌گذارد؟',
    answer:
      'اثر یورو ضعیف‌تر و غیرمستقیم‌تر است، چون خرید سنگ‌آهن و قراضه در بازار جهانی عمدتاً به دلار قیمت‌گذاری می‌شود. یورو بیشتر برای کارخانه‌هایی اهمیت دارد که ماشین‌آلات یا مواد اولیهٔ خاص از اروپا وارد می‌کنند، نه برای کل بازار آهن.',
  },
  {
    question: 'نرخ شمش فولاد در آهن‌تایم چطور تعیین می‌شود؟',
    answer:
      'برخلاف دلار و طلا که با پایش خودکار لحظه‌ای ثبت می‌شوند، نرخ شمش فولاد را تیم کارشناسی آهن‌تایم بر پایهٔ بورس کالای ایران بررسی و درج می‌کند. این کار عمدی است: هدف، جلوگیری از اثر نوسانات کاذب و لحظه‌ای بر عددی است که مستقیم روی قیمت میلگرد و تیرآهن اثر می‌گذارد.',
  },
  {
    question: 'می‌شود از روی نرخ دلار امروز، قیمت آهن فردا را دقیق پیش‌بینی کرد؟',
    answer:
      'نه به‌طور دقیق. دلار یکی از چند متغیر اصلی است، نه تنها عامل: عرضهٔ داخلی، سیاست صادرات و حتی موجودی انبار کارخانه‌ها هم روی قیمت نهایی اثر دارند. نرخ دلار جهت حرکت قیمت آهن را نشان می‌دهد، نه مقدار دقیق تغییرش.',
  },
];

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
              نرخ لحظه‌ای دلار، یورو، طلای ۱۸ عیار، انس جهانی طلا و شمش فولاد را همین‌جا می‌بینید؛
              پنج متغیری که مستقیم یا غیرمستقیم روی قیمت میلگرد، تیرآهن و پروفیل اثر می‌گذارند.
              وقتی دلار یا شمش فولاد گران‌تر می‌شود، این اثر معمولاً ظرف چند هفته به قیمت نهایی
              آهن‌آلات می‌رسد، نه همان روز؛ در ادامهٔ همین صفحه توضیح می‌دهیم چرا.
            </Text>
          </Stack>

          <MarketBoard />

          <section aria-labelledby="market-why-title">
            <Card className={styles.explainer}>
              <Stack gap={5}>
                <Heading level={2} id="market-why-title">
                  چرا قیمت آهن‌آلات دنبال دلار و طلا می‌رود؟
                </Heading>
                <Text color="muted">
                  شمش فولاد، مادهٔ اولیهٔ اصلی میلگرد و تیرآهن، در بورس کالای ایران و بر پایهٔ
                  هزینهٔ دلاریِ سنگ‌آهن و قراضهٔ وارداتی قیمت‌گذاری می‌شود. وقتی دلار گران‌تر
                  می‌شود، این هزینه برای کارخانه‌ها بالا می‌رود و معمولاً ظرف چند هفته روی قیمت
                  نهایی میلگرد، تیرآهن و پروفیل هم اثر می‌گذارد.
                </Text>
                <Text color="muted">
                  انس جهانی طلا هم روی قیمت آهن اثر می‌گذارد، هرچند از زاویه‌ای متفاوت با دلار. وقتی
                  نگرانی از تورم یا بی‌ثباتی اقتصاد جهانی بالا می‌رود، سرمایه معمولاً هم‌زمان به طلا
                  و فلزات پایه مثل آهن و مس پناه می‌برد، چون هر دو دارایی فیزیکی محسوب می‌شوند. به
                  همین دلیل در بازه‌های پرتلاطم، انس جهانی و قیمت جهانی فولاد اغلب هم‌جهت حرکت
                  می‌کنند، حتی وقتی ربط مستقیمی به هم ندارند.
                </Text>

                <ul className={styles.chainList}>
                  <li>
                    دلار گران می‌شود، پس هزینهٔ سنگ‌آهن و قراضهٔ وارداتی برای کارخانه بالا می‌رود.
                  </li>
                  <li>بورس کالای ایران، نرخ شمش فولاد را با همین هزینهٔ تازه به‌روز می‌کند.</li>
                  <li>
                    کارخانه‌ها قیمت میلگرد، تیرآهن و پروفیل را روی هزینهٔ جدید شمش تنظیم می‌کنند.
                  </li>
                  <li>این اثر معمولاً ظرف چند هفته، نه همان روز، در بازار آهن دیده می‌شود.</li>
                </ul>

                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <caption className={styles.tableCaption}>
                      نقش هر متغیر در قیمت آهن‌آلات (نرخ زندهٔ همین لحظه را در تابلوی بالای همین صفحه
                      ببینید)
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">متغیر</th>
                        <th scope="col">نقش در قیمت آهن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROLE_ROWS.map((row) => (
                        <tr key={row.label}>
                          <th scope="row">{row.label}</th>
                          <td>{row.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Stack>
            </Card>
          </section>

          <ArticleFaq items={FAQ_ITEMS} />

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
