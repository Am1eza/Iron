'use client';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { localizeDigits } from '@/lib/utils/format';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import type { AppLocale } from '@/i18n/config';
import styles from './Pagination.module.css';

export type PageEntry = { value: number; href: string } | '…';

/**
 * The rendering half of `Pagination` — split out so `'use client'` never
 * has to receive `hrefFor` itself (see Pagination.tsx's header comment).
 * Everything here is plain, serializable data: numbers and already-resolved
 * href strings. `'use client'` is what lets page numbers and the prev/next
 * labels actually respond to a locale switch (Persian digits for fa, Latin
 * for en/ar/zh) — a Server Component's own literal output never revisits
 * itself after a client-side locale change.
 */
export function PaginationClient({
  page,
  prevHref,
  nextHref,
  pages,
}: {
  page: number;
  prevHref?: string;
  nextHref?: string;
  pages: PageEntry[];
}) {
  const t = useTranslations('common');
  const locale = useLocale() as AppLocale;

  return (
    <nav className={styles.nav} aria-label={t('pagination')}>
      <PageLink
        href={prevHref}
        label={t('action.previous')}
        rel="prev"
        icon={<ChevronStartIcon size={18} className="icon--rtl" />}
      />
      <ul className={styles.list}>
        {pages.map((p, i) =>
          p === '…' ? (
            <li key={`gap-${i}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p.value}>
              <Link
                href={p.href}
                className={`${styles.page} tnum`}
                aria-current={p.value === page ? 'page' : undefined}
                data-active={p.value === page ? '' : undefined}
              >
                {localizeDigits(p.value, locale)}
              </Link>
            </li>
          ),
        )}
      </ul>
      <PageLink
        href={nextHref}
        label={t('action.next')}
        rel="next"
        icon={<ChevronEndIcon size={18} className="icon--rtl" />}
      />
    </nav>
  );
}

function PageLink({
  href,
  label,
  rel,
  icon,
}: {
  href?: string;
  label: string;
  rel: 'prev' | 'next';
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <span className={`${styles.arrow} ${styles.disabled}`} aria-disabled="true">
        {icon}
        <span className="visually-hidden">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} className={styles.arrow} aria-label={label} rel={rel}>
      {icon}
    </Link>
  );
}
