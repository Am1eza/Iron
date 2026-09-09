'use client';
import { useTranslations } from 'next-intl';
import { Heading, Text, Overline, EmptyState } from '@/components/ui';

/**
 * The translated half of the /blog and /news archive header + empty state
 * (`ArticleIndex.tsx` stays a Server Component for the actual DB fetch,
 * pagination redirect and its own metadata/breadcrumb — the established
 * SSR-shell exception every other page in this app uses). `type` is the
 * only prop; everything else is a translation lookup, matching the
 * `MarketPageContent`/`WarehouseLanding` split used elsewhere on the site.
 */
type ArchiveType = 'blog' | 'news';

export function ArticleIndexHeader({ type }: { type: ArchiveType }) {
  const t = useTranslations('articleIndex');
  return (
    <div>
      <Overline>{t(`${type}.overline`)}</Overline>
      <Heading level={1} id={`${type}-title`}>
        {t(`${type}.h1`)}
      </Heading>
      <Text color="muted">{t(`${type}.lede`)}</Text>
    </div>
  );
}

export function ArticleIndexHeading({
  type,
  variant,
  id,
}: {
  type: ArchiveType;
  variant: 'featured' | 'list';
  id: string;
}) {
  const t = useTranslations('articleIndex');
  return (
    <Heading level={2} id={id}>
      {variant === 'featured' ? t(`${type}.featuredTitle`) : t(`${type}.listTitle`)}
    </Heading>
  );
}

export function ArticleIndexEmptyState({ type }: { type: ArchiveType }) {
  const t = useTranslations('articleIndex');
  return (
    <EmptyState size="section" headline={t(`${type}.emptyHeadline`)} body={t(`${type}.emptyBody`)} showAi />
  );
}
