'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { Stack, Breadcrumbs, Heading, Text, Divider } from '@/components/ui';
import { PageHero } from '@/components/company/PageHero';
import { FeatureGrid, type Feature } from '@/components/company/FeatureGrid';
import {
  TagIcon,
  ClockIcon,
  AiMarkIcon,
  ChartIcon,
  CheckCircleIcon,
  PhoneIcon,
  BankIcon,
  ShieldIcon,
} from '@/components/primitives/icons';
import prose from '@/components/company/Prose.module.css';

/**
 * The visible body of «درباره ما», lifted out of `app/about/page.tsx` so its
 * copy can go through the `about` dictionary and follow the client-side locale
 * switch (see `i18n/LocaleProvider`). The page itself stays a Server Component
 * and keeps everything that MUST be server-rendered and Persian: the route
 * `metadata`, the Organization + BreadcrumbList JSON-LD, and the async
 * `ContactCard`, which is handed in here as the `contactCard` slot.
 *
 * Route metadata is deliberately NOT translated: it is generated at build time
 * with no request context, so there is exactly one static Persian title and
 * description per URL under this cookie-based (non-URL-prefixed) i18n setup.
 * Per-language titles need URL-prefixed locales first — see `i18n/request.ts`.
 */
const ADVANTAGE_KEYS = [
  { key: 'noMiddleman', icon: <TagIcon size={22} /> },
  { key: 'fast', icon: <ClockIcon size={22} /> },
  { key: 'ai', icon: <AiMarkIcon size={22} />, accent: true },
  { key: 'transparent', icon: <ChartIcon size={22} /> },
  { key: 'direct', icon: <CheckCircleIcon size={22} /> },
  { key: 'support', icon: <PhoneIcon size={22} /> },
  { key: 'bourse', icon: <BankIcon size={22} /> },
  { key: 'lc', icon: <ShieldIcon size={22} />, accent: true },
] as const;

export function AboutContent({
  orgName,
  contactCard,
}: {
  orgName: string;
  contactCard: ReactNode;
}) {
  const t = useTranslations('about');
  // The prose keeps the emphasis it had as JSX — the `<b>` markers live in the
  // message so each translator can place them where their own sentence needs
  // them, instead of the split falling wherever the Persian word order put it.
  const strong = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };

  const advantages: Feature[] = ADVANTAGE_KEYS.map(({ key, icon, ...rest }) => ({
    title: t(`adv.${key}.title`),
    desc: t(`adv.${key}.desc`),
    icon,
    accent: 'accent' in rest ? rest.accent : undefined,
  }));

  return (
    <Stack gap={10}>
      <Stack gap={6}>
        <Breadcrumbs
          items={[
            { label: t('crumbHome'), href: routes.home() },
            { label: t('crumb'), href: routes.about() },
          ]}
        />
        <PageHero
          id="about-title"
          eyebrow={t('eyebrow')}
          title={t('title')}
          lead={t('lead', { org: orgName })}
          ctas={[
            { label: t('ctaPrices'), href: routes.prices(), variant: 'primary', arrow: true },
            { label: t('ctaAi'), href: routes.ai(), variant: 'secondary' },
          ]}
        />
      </Stack>

      <Divider />

      {/* Story + mission */}
      <Stack gap={4}>
        <Heading level={2}>{t('storyTitle')}</Heading>
        <div className={prose.prose}>
          <p>{t.rich('storyP1', strong)}</p>
          <p>{t.rich('storyP2', strong)}</p>
        </div>
      </Stack>

      {/* Why us — advantages merged in from the former /why page */}
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading level={2}>{t('whyTitle')}</Heading>
          <Text color="muted">{t('whyLead')}</Text>
        </Stack>
        <FeatureGrid items={advantages} />
      </Stack>

      {/* How buying works — no online payment */}
      <Stack gap={4}>
        <Heading level={2}>{t('howTitle')}</Heading>
        <div className={prose.prose}>
          <p>{t.rich('howBody', strong)}</p>
        </div>
      </Stack>

      {/* Contact */}
      <Stack gap={6}>
        <Heading level={2}>{t('contactTitle')}</Heading>
        {contactCard}
      </Stack>
    </Stack>
  );
}
