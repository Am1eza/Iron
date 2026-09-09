'use client';
import type { ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { SiteContact } from '@/lib/server/contact';
import { localizeDigits } from '@/lib/utils/format';
import { Stack, Breadcrumbs, Alert } from '@/components/ui';
import { PageHero } from '@/components/company/PageHero';
import { LegalDoc, type LegalSection } from '@/components/company/LegalDoc';

const bold = (chunks: ReactNode) => <strong>{chunks}</strong>;
const em = (chunks: ReactNode) => <em>{chunks}</em>;

/**
 * The translated half of the privacy policy — hero, alert, and the full
 * legal document body (previously deliberately left fa-only; the user
 * explicitly asked for this too). `page.tsx` stays a Server Component for
 * `metadata`/fa breadcrumbs and to fetch `CONTACT`, which it passes down as
 * plain data. Same Client-Component split as PricesPageContent/
 * MarketPageContent. `LegalDoc.tsx` itself was already translated in an
 * earlier commit — not touched here.
 */
export function PrivacyPageContent({
  crumbs,
  contact,
  lastUpdatedDate,
}: {
  crumbs: { label: string; href?: string }[];
  contact: SiteContact;
  /** Jalali month+year string — stays fa/Jalali in every locale, same
   *  convention as every other date in this app (see ProformaSheet.tsx). */
  lastUpdatedDate: string;
}) {
  const t = useTranslations('privacyPage');
  const locale = useLocale();

  const rich = (key: string) => t.rich(key, { b: bold, i: em });

  const sections: LegalSection[] = [
    { id: 'intro', title: t('sections.intro.title'), body: <p>{t('sections.intro.body')}</p> },
    {
      id: 'collect',
      title: t('sections.collect.title'),
      body: (
        <ul>
          <li>{rich('sections.collect.item1')}</li>
          <li>{rich('sections.collect.item2')}</li>
          <li>{rich('sections.collect.item3')}</li>
          <li>{rich('sections.collect.item4')}</li>
        </ul>
      ),
    },
    {
      id: 'use',
      title: t('sections.use.title'),
      body: (
        <ul>
          <li>{t('sections.use.item1')}</li>
          <li>{t('sections.use.item2')}</li>
          <li>{t('sections.use.item3')}</li>
        </ul>
      ),
    },
    {
      id: 'ai',
      title: t('sections.ai.title'),
      body: (
        <>
          <p>{rich('sections.ai.p1')}</p>
          <p>{rich('sections.ai.p2')}</p>
          <p>{rich('sections.ai.p3')}</p>
          <p>{rich('sections.ai.p4')}</p>
          <p>{t('sections.ai.p5')}</p>
        </>
      ),
    },
    { id: 'sms', title: t('sections.sms.title'), body: <p>{rich('sections.sms.body')}</p> },
    {
      id: 'analytics',
      title: t('sections.analytics.title'),
      body: (
        <>
          <p>{rich('sections.analytics.p1')}</p>
          <p>{rich('sections.analytics.p2')}</p>
          <p>{t('sections.analytics.p3')}</p>
        </>
      ),
    },
    { id: 'no-sale', title: t('sections.noSale.title'), body: <p>{rich('sections.noSale.body')}</p> },
    { id: 'security', title: t('sections.security.title'), body: <p>{t('sections.security.body')}</p> },
    {
      id: 'rights',
      title: t('sections.rights.title'),
      body: (
        <ul>
          <li>{t('sections.rights.item1')}</li>
          <li>{t('sections.rights.item2')}</li>
          <li>{t('sections.rights.item3')}</li>
          <li>{t('sections.rights.item4')}</li>
        </ul>
      ),
    },
    {
      id: 'contact',
      title: t('sections.contact.title'),
      body: (
        <p>
          {t.rich('sections.contact.body', {
            landline: () => (
              <a href={`tel:${contact.phoneLandline}`}>
                <bdi>{localizeDigits(contact.phoneLandline, locale)}</bdi>
              </a>
            ),
            mobile: () => (
              <a href={`tel:${contact.phoneMobile}`}>
                <bdi>{localizeDigits(contact.phoneMobile, locale)}</bdi>
              </a>
            ),
          })}
        </p>
      ),
    },
  ];

  return (
    <Stack gap={8}>
      <Stack gap={6}>
        <Breadcrumbs items={crumbs} />
        <PageHero id="privacy-title" eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
        <Alert tone="info" title={t('alertTitle')}>
          {t('alertBody')}
        </Alert>
      </Stack>

      <LegalDoc sections={sections} updatedLabel={t('lastUpdated', { date: lastUpdatedDate })} />
    </Stack>
  );
}
