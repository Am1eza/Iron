import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { AdvisorChat, GREETING_TEXT } from '@/components/ai/AdvisorChat';
import { AdvisorAbout } from '@/components/ai/AdvisorAbout';
import styles from './page.module.css';
import { PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
import { getContact } from '@/lib/server/contact';

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
  // The real, admin-editable numbers — read here (server) and passed down, so
  // the advisor's «گفتگو با کارشناس» row can never drift from the footer's.
  const contact = await getContact();
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
    <>
      <BreadcrumbJsonLd items={crumbs} />
      {/*
        AN APP SURFACE, NOT A PAGE SECTION.

        What shipped before this put 381px of hero above the chat and 1143px
        of explainer below it, leaving the chat 702px of a 4509px document —
        and the composer, the one control the page exists for, at y=922 on a
        900px laptop and 207px below the fold on a phone.

        So the first screen is now the chat and nothing else. `Container`/
        `Section` are deliberately not used here: both add block padding and a
        reading-width cap that are right for an article and wrong for an app
        shell, which has to be able to reach the full viewport height and let
        its own thread own the reading width.

        The h1 and breadcrumb stay in the DOM — this page still has to rank —
        but as a slim header row inside the shell rather than a hero block.
      */}
      <div className={styles.surface}>
        <AdvisorChat
          initialQuestion={initialQuestion}
          initialMessages={initialMessages}
          contact={{ phoneLandline: contact.phoneLandline, phoneMobile: contact.phoneMobile }}
          crumbs={crumbs}
          heading="مشاور هوشمند خرید آهن و فولاد"
        />
      </div>

      {/* Below the fold by construction: the shell above is exactly one
          viewport tall, so this can no longer compress the chat. */}
      <Container width="wide">
        <AdvisorAbout faqItems={FAQ_ITEMS} />
      </Container>
    </>
  );
}
