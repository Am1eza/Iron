'use client';
import type { ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { SiteContact } from '@/lib/server/contact';
import { localizeDigits } from '@/lib/utils/format';
import { Stack, Breadcrumbs, Alert } from '@/components/ui';
import { PageHero } from '@/components/company/PageHero';
import { LegalDoc, type LegalSection } from '@/components/company/LegalDoc';

const bold = (chunks: ReactNode) => <strong>{chunks}</strong>;

/**
 * The translated half of the terms of service — hero, alert, and the full
 * legal document body (previously deliberately left fa-only; the user
 * explicitly asked for this too). `page.tsx` stays a Server Component for
 * `metadata`/fa breadcrumbs and to fetch `CONTACT`/`orgName`, both passed
 * down as plain data. Same split as PrivacyPageContent.
 */
export function TermsPageContent({
  crumbs,
  contact,
  orgName,
  lastUpdatedDate,
}: {
  crumbs: { label: string; href?: string }[];
  contact: SiteContact;
  orgName: string;
  /** Jalali month+year string — stays fa/Jalali in every locale, same
   *  convention as every other date in this app (see ProformaSheet.tsx). */
  lastUpdatedDate: string;
}) {
  const t = useTranslations('termsPage');
  const locale = useLocale();

  const rich = (key: string) => t.rich(key, { b: bold });

  const sections: LegalSection[] = [
    {
      id: 'definitions',
      title: t('sections.definitions.title'),
      body: (
        <ul>
          <li>{rich('sections.definitions.item1')}</li>
          <li>{rich('sections.definitions.item2')}</li>
          <li>{rich('sections.definitions.item3')}</li>
          <li>{rich('sections.definitions.item4')}</li>
        </ul>
      ),
    },
    {
      id: 'service',
      title: t('sections.service.title'),
      body: (
        <>
          <p>{t('sections.service.p1')}</p>
          <p>{rich('sections.service.p2')}</p>
        </>
      ),
    },
    {
      id: 'prices',
      title: t('sections.prices.title'),
      body: (
        <>
          <p>{rich('sections.prices.p1')}</p>
          <p>{t('sections.prices.p2')}</p>
        </>
      ),
    },
    {
      id: 'request',
      title: t('sections.request.title'),
      body: (
        <>
          <p>{t('sections.request.p1')}</p>
          <p>{t('sections.request.p2')}</p>
        </>
      ),
    },
    { id: 'delivery', title: t('sections.delivery.title'), body: <p>{t('sections.delivery.body')}</p> },
    {
      id: 'responsibilities',
      title: t('sections.responsibilities.title'),
      body: (
        <ul>
          <li>{t('sections.responsibilities.item1')}</li>
          <li>{t('sections.responsibilities.item2')}</li>
          <li>{t('sections.responsibilities.item3')}</li>
        </ul>
      ),
    },
    { id: 'ip', title: t('sections.ip.title'), body: <p>{t('sections.ip.body', { orgName })}</p> },
    { id: 'changes', title: t('sections.changes.title'), body: <p>{t('sections.changes.body')}</p> },
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
        <PageHero id="terms-title" eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
        <Alert tone="info" title={t('alertTitle')}>
          {t('alertBody')}
        </Alert>
      </Stack>

      <LegalDoc sections={sections} updatedLabel={t('lastUpdated', { date: lastUpdatedDate })} />
    </Stack>
  );
}
