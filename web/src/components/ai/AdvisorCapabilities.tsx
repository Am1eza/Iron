'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChartIcon, ClockIcon, IBeamGlyph, InfoIcon } from '@/components/primitives/icons';
import { routes } from '@/lib/routes';
import { Link } from '@/i18n/navigation';
import styles from './AdvisorCapabilities.module.css';

/**
 * What this advisor does that a general-purpose chat cannot — capabilities
 * that are REAL tools in `aiTools.ts` (`compareFactories`, `calcWeight`,
 * `searchGuides`, `forecastPrice`), described in the terms a buyer would use.
 *
 * Deliberately few claims, each of which the page can back up on the spot:
 * nothing here is a capability the advisor doesn't have. It sits BELOW the
 * chat panel on purpose (see app/ai/page.tsx) — the composer is the page's
 * primary control and must stay one screen away, not below an explainer.
 */
export function AdvisorCapabilities() {
  const t = useTranslations('ai.capabilities');
  const weightLink = (chunks: ReactNode) => (
    <Link href={routes.tool('weight')} className={styles.link}>
      {chunks}
    </Link>
  );
  const pricesLink = (chunks: ReactNode) => (
    <Link href={routes.prices()} className={styles.link}>
      {chunks}
    </Link>
  );
  const CAPABILITIES = [
    { Icon: ChartIcon, title: t('compare.title'), body: t('compare.body') },
    { Icon: IBeamGlyph, title: t('weight.title'), body: t.rich('weight.body', { link: weightLink }) },
    { Icon: ClockIcon, title: t('outlook.title'), body: t('outlook.body') },
    { Icon: InfoIcon, title: t('sourced.title'), body: t('sourced.body') },
  ] as const;

  return (
    <section className={styles.section} aria-labelledby="advisor-can-title">
      <h2 id="advisor-can-title" className={styles.title}>
        {t('title')}
      </h2>
      <ul className={styles.list}>
        {CAPABILITIES.map(({ Icon, title, body }) => (
          <li key={title} className={styles.item}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={22} />
            </span>
            <div>
              <h3 className={styles.itemTitle}>{title}</h3>
              <p className={styles.itemText}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.footnote}>{t.rich('footnote', { link: pricesLink })}</p>
    </section>
  );
}
