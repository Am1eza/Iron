'use client';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { Stack, Breadcrumbs } from '@/components/ui';
import { PageHero } from '@/components/company/PageHero';

/**
 * The breadcrumbs + hero of «تماس با ما», split out of `app/contact/page.tsx`
 * so its copy goes through the `contactPage` dictionary and follows the
 * client-side locale switch. The page keeps the route `metadata`, the
 * LocalBusiness JSON-LD and the async `ContactCard` — see `AboutContent`'s
 * header comment for why metadata stays Persian.
 */
export function ContactIntro() {
  const t = useTranslations('contactPage');
  return (
    <Stack gap={6}>
      <Breadcrumbs
        items={[
          { label: t('crumbHome'), href: routes.home() },
          { label: t('crumb'), href: routes.contact() },
        ]}
      />
      <PageHero id="contact-title" eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
    </Stack>
  );
}
