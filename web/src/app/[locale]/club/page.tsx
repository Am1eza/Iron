import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { ClubLanding } from '@/components/club/ClubLanding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta.club' });
  return buildMetadata({ locale, title: t('title'), description: t('description'), path: routes.club() });
}


export default function ClubPage() {
  return <ClubLanding />;
}
