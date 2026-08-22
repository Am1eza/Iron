import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Heading, Text, Overline, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { AdvisorChat, GREETING_TEXT } from '@/components/ai/AdvisorChat';
import { AdvisorCapabilities } from '@/components/ai/AdvisorCapabilities';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';

export const metadata: Metadata = buildMetadata({
  title: 'مشاور هوشمند خرید آهن و فولاد',
  description:
    'مشاور هوشمند آهن‌تایم بر پایهٔ قیمت‌های واقعی سایت جواب می‌دهد: قیمت روز مقاطع، وزن دقیق هر شاخه، مقایسهٔ کارخانه‌ها روی تناژ شما و ثبت درخواست پیش‌فاکتور در همان گفتگو.',
  path: routes.ai(),
});

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'مشاور هوشمند', href: routes.ai() },
];

/** What a visitor who lands on «مشاور هوشمند آهن» actually wants to know
 *  before typing. Each answer stands alone — FAQPage entries get quoted out
 *  of page context by Google's "People also ask" and AI Overviews — and each
 *  is deliberately free of prices or dated figures, which belong in the live
 *  tables and would silently go stale in prose. Written impersonally rather
 *  than in the advisor's own تو-voice, for the same reason: quoted out of
 *  context, these are the site speaking, not the advisor. */
const FAQ_ITEMS = [
  {
    question: 'مشاور هوشمند آهن‌تایم قیمت‌ها را از کجا می‌آورد؟',
    answer:
      'از همان دیتابیسی که جدول‌های قیمت سایت از آن ساخته می‌شوند؛ نرخ‌ها را کارشناسان آهن‌تایم پس از استعلام از کارخانه و بازار دستی ثبت می‌کنند. مشاور هیچ عددی نمی‌سازد: اگر قیمتی برای محصولی ثبت نشده یا کهنه باشد، به‌جای حدس‌زدن می‌گوید کارشناس آن را اعلام می‌کند.',
  },
  {
    question: 'وزنی که مشاور اعلام می‌کند چقدر دقیق است؟',
    answer:
      'وزن‌ها با فرمول استاندارد هر مقطع (وزن تئوری) حساب می‌شوند، دقیقاً با همان فرمولی که ابزار وزن‌سنج آهن‌تایم به کار می‌برد، نه با تخمین. وزن واقعی باسکول به‌دلیل رواداری تولید ممکن است اندکی با وزن تئوری فرق کند؛ عدد نهایی در پیش‌فاکتور رسمی مشخص می‌شود.',
  },
  {
    question: 'می‌شود همان‌جا در گفتگو پیش‌فاکتور گرفت؟',
    answer:
      'بله. وقتی محصول، مقدار و مشخصات روشن شد، مشاور یک کارت خلاصهٔ درخواست با قیمت و وزن روز زیر پاسخش نشان می‌دهد و ثبت نهایی با زدن دکمهٔ همان کارت انجام می‌شود. چیزی بدون تأیید کاربر ثبت نمی‌شود.',
  },
  {
    question: 'برای خرید باید آنلاین پرداخت کرد؟',
    answer:
      'خیر. در آهن‌تایم پرداخت آنلاین وجود ندارد و هیچ مرحلهٔ پرداختی در گفتگو نیست. پس از ثبت درخواست، کارشناس فروش تماس می‌گیرد و قیمت، موجودی و زمان تحویل را نهایی می‌کند.',
  },
  {
    question: 'اگر مشاور جواب سؤالی را نداشته باشد چه می‌شود؟',
    answer:
      'همان را صادقانه می‌گوید و گفتگو را به کارشناس انسانی می‌سپارد. حوزهٔ کاری مشاور آهن و فولاد و ساخت‌وساز است؛ برای موضوع‌های بیرون از این حوزه پاسخ نمی‌دهد.',
  },
];

type Search = { searchParams: Promise<{ q?: string }> };

export default async function AiPage({ searchParams }: Search) {
  const { q } = await searchParams;
  const initialQuestion = typeof q === 'string' ? q : undefined;
  // Rendered server-side so the advisor's opening message is real, crawlable
  // HTML on first load instead of only appearing after client-side hydration.
  const initialMessages = [
    {
      id: 'greeting',
      role: 'ai' as const,
      text: GREETING_TEXT,
      chips: initialQuestion ? undefined : PURPOSE_CHIPS,
    },
  ];
  return (
    <Container width="narrow">
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={8}>
        <Stack gap={6}>
          <Stack gap={3}>
            <Breadcrumbs items={crumbs} />
            <Overline>اول مشورت، بعد خرید</Overline>
            <Heading level={1}>مشاور هوشمند خرید آهن و فولاد</Heading>
            {/* Two sentences, not four. At 375px every line of lede is ~37px
                of the one screen the visitor has, and the composer is what
                they came for: the first version pushed it ~400px past the
                fold. The payment fact moved down to the capability strip. */}
            <Text color="muted" variant="body-lg">
              مشاور آهن‌تایم بر پایهٔ همان قیمت‌هایی جواب می‌دهد که در جدول‌های سایت می‌بینی؛ هیچ
              عددی از خودش نمی‌سازد. بگو چه محصولی و برای چه کاری می‌خواهی تا قیمت روز، وزن دقیق
              مقاطع و ارزان‌ترین کارخانه برای تناژت را حساب کند و در پایان، اگر خواستی، پیش‌فاکتور
              هم بگیری.
            </Text>
          </Stack>

          {/* The chat sits directly under the header: it is this page's primary
              control, so nothing explanatory goes between the lede and the
              composer. Everything that describes the advisor comes AFTER it. */}
          <AdvisorChat initialQuestion={initialQuestion} initialMessages={initialMessages} />

          <AdvisorCapabilities />
          <ArticleFaq items={FAQ_ITEMS} />
        </Stack>
      </Section>
    </Container>
  );
}
