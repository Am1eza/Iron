'use client';
import { useTranslations } from 'next-intl';
import { Stack, Heading, Text, Overline, Breadcrumbs, Card } from '@/components/ui';
import { MarketBoard } from '@/components/market/MarketBoard';
import { ArticleCard } from '@/components/content/ArticleCard';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import type { Article } from '@/lib/types/domain';
import styles from './page.module.css';

const ROLE_KEYS = ['usd', 'eur', 'gold18', 'ounce', 'billet'] as const;
const FAQ_COUNT = 6;
const CHAIN_COUNT = 4;

/**
 * The /market page's actual visible content — extracted from the Server
 * Component `page.tsx` (which keeps only `metadata`, `revalidate`, and the
 * server-fetched `relatedArticle`; `crumbs` is already locale-aware, built
 * there via `getTranslations()`) so this substantial explainer/FAQ copy can
 * localize. Every FAQ answer/explainer paragraph is genuinely page-authored
 * copy (not CMS article content, which stays fa elsewhere in this app), so
 * it translates in full here.
 */
export function MarketPageContent({
  crumbs,
  relatedArticle,
}: {
  crumbs: { label: string; href?: string }[];
  relatedArticle: Article | null;
}) {
  const t = useTranslations('marketPage');

  return (
    <Stack gap={8}>
      <Stack gap={3}>
        <Breadcrumbs items={crumbs} />
        <Overline>{t('overline')}</Overline>
        <Heading level={1} id="market-title">
          {t('title')}
        </Heading>
        <Text color="muted" variant="body-lg">
          {t('intro')}
        </Text>
      </Stack>

      <MarketBoard />

      <section aria-labelledby="market-why-title">
        <Card className={styles.explainer}>
          <Stack gap={5}>
            <Heading level={2} id="market-why-title">
              {t('whyTitle')}
            </Heading>
            <Text color="muted">{t('explainer1')}</Text>
            <Text color="muted">{t('explainer2')}</Text>

            <ul className={styles.chainList}>
              {Array.from({ length: CHAIN_COUNT }, (_, i) => (
                <li key={i}>{t(`chain.${i}`)}</li>
              ))}
            </ul>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.tableCaption}>{t('roleTableCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('roleCol.variable')}</th>
                    <th scope="col">{t('roleCol.role')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_KEYS.map((key) => (
                    <tr key={key}>
                      <th scope="row">{t(`role.${key}.label`)}</th>
                      <td>{t(`role.${key}.role`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Stack>
        </Card>
      </section>

      <ArticleFaq
        items={Array.from({ length: FAQ_COUNT }, (_, i) => ({
          question: t(`faq.${i}.question`),
          answer: t(`faq.${i}.answer`),
        }))}
      />

      {relatedArticle ? (
        <section className={styles.related} aria-labelledby="market-related-title">
          <h2 id="market-related-title" className={styles.relatedTitle}>
            {t('relatedTitle')}
          </h2>
          <ul className={styles.relatedGrid}>
            <ArticleCard article={relatedArticle} />
          </ul>
        </section>
      ) : null}
    </Stack>
  );
}
