import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { AdvisorChat } from '@/components/ai/AdvisorChat';
import { AdvisorAbout } from '@/components/ai/AdvisorAbout';
import styles from './page.module.css';
import { PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
import { getContact } from '@/lib/server/contact';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.ai');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.ai() });
}

type Search = { searchParams: Promise<{ q?: string }> };

export default async function AiPage({ searchParams }: Search) {
  const { q } = await searchParams;
  const initialQuestion = typeof q === 'string' ? q : undefined;
  // The real, admin-editable numbers — read here (server) and passed down, so
  // the advisor's «گفتگو با کارشناس» row can never drift from the footer's.
  const [contact, t] = await Promise.all([getContact(), getTranslations()]);
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.ai.title'), href: routes.ai() },
  ];
  // Rendered server-side (now locale-aware — [locale]/layout.tsx resolves the
  // locale before this renders) so the advisor's opening message is real,
  // crawlable HTML on first load instead of only appearing after client-side
  // hydration. Reuses the same `ai.chat.greeting` string AdvisorChat's own
  // client-side greeting falls back to, so the two never drift.
  const initialMessages = [
    {
      id: 'greeting',
      role: 'ai' as const,
      text: t('ai.chat.greeting'),
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
          heading={t('meta.ai.title')}
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
