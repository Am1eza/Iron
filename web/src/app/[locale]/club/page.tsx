import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { ClubLanding } from '@/components/club/ClubLanding';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.club');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.club() });
}

export default function ClubPage() {
  return <ClubLanding />;
}
