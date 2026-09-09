import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { AdvisorChat } from '@/components/ai/AdvisorChat';
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

type Search = { searchParams: Promise<{ q?: string }> };

export default async function AiPage({ searchParams }: Search) {
  const { q } = await searchParams;
  const initialQuestion = typeof q === 'string' ? q : undefined;
  // The real, admin-editable numbers — read here (server) and passed down, so
  // the advisor's «گفتگو با کارشناس» row can never drift from the footer's.
  const contact = await getContact();
  // Rendered server-side so the advisor's opening message is real, crawlable
  // HTML on first load instead of only appearing after client-side hydration.
  // Persian, like every other server-rendered string on this page (metadata,
  // crumbs) — this app never resolves locale server-side (LocaleProvider's
  // header comment), so the server always renders the static fa shell.
  // AdvisorChat's own client-side greeting (used on "new chat" / reopening an
  // empty conversation) already localizes; the FAQ below (`AdvisorAbout`) is
  // client-rendered for the same reason, same as `ArticleFaq`'s FAQPage
  // JSON-LD elsewhere on the site.
  const initialMessages = [
    {
      id: 'greeting',
      role: 'ai' as const,
      text: 'سلام! من مشاور هوشمند آهن‌تایم‌ام.\nمثل یک دوستِ کاربلد کمکت می‌کنم بهترین خرید را بکنی؛ اول مشورت، بعد خرید.',
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
        <AdvisorAbout />
      </Container>
    </>
  );
}
