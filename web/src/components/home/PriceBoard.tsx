'use client';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import type { PriceRow } from '@/lib/types/domain';
// Deep import — see the note in app/error.tsx (bundle-size reasoning, unrelated
// to this file's own 'use client' below).
import { MovementBadge } from '@/components/ui/PriceParts';
import { CountUp } from '@/components/ui/CountUp';
import { formatJalali } from '@/lib/utils/jalali';
import { priceHiddenLabel } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
import styles from './PriceBoard.module.css';

/**
 * The hero «تابلوی قیمت» — a gunmetal, blueprint-gridded live price board with
 * oversized Estedad tabular numerals. Real rows from the catalog (server-fed
 * by the parent page — unaffected by this being 'use client'), real movement
 * badges, count-up on view. This is the brand's signature panel: price data
 * as the hero, not a stock photo.
 *
 * `'use client'` (was a plain server component): every label here was
 * hardcoded Persian, baked into the SSR HTML and never revisited when
 * `LocaleProvider` swapped the rest of the page to a visitor's chosen locale
 * — the homepage's own signature widget was the clearest single piece of
 * evidence that "switching language doesn't actually translate the page"
 * (see the i18n audit). `r.name` (SKU name) stays whatever the DB has —
 * that part is a real structural gap (no per-locale product-name column),
 * not a wiring bug, and is documented as such rather than "fixed" here. The
 * Jalali calendar in the date stamp is left as-is too: Jalali dates are this
 * site's locked localization convention (CLAUDE.md), not a bug — though its
 * digits staying Persian even in non-fa locales is a flagged, deliberately-
 * undecided item; see the audit.
 */
export function PriceBoard({ rows }: { rows: PriceRow[] }) {
  const t = useTranslations('home.priceBoard');
  const tMovement = useTranslations('common.movement');
  const locale = useLocale() as AppLocale;
  const updated = rows[0]?.current.updatedAt;
  const movementLabels = { up: tMovement('up'), down: tMovement('down'), flat: tMovement('flat') };
  return (
    <aside className={`${styles.board} blueprint`} aria-label={t('ariaLabel')}>
      <header className={styles.head}>
        <span className={styles.live}>
          <span className={styles.dot} aria-hidden="true" />
          {t('live')}
        </span>
        {updated && <span className={styles.date}>{formatJalali(updated, 'yyyy/MM/dd، HH:mm')}</span>}
      </header>

      <ul className={styles.rows}>
        {rows.map((r) => (
          <li key={r.id} className={styles.row}>
            <Link
              href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
              className={styles.rowLink}
            >
              <span className={styles.name}>{r.name}</span>
              <span className={styles.figures}>
                {priceHiddenLabel(r.current) ? (
                  <span className={`${styles.price} tnum`}>{priceHiddenLabel(r.current)}</span>
                ) : (
                  <>
                    <span className={`${styles.price} tnum`}>
                      <CountUp value={r.current.price} locale={locale} />
                    </span>
                    <span className={styles.unit}>{t('unit')}</span>
                    <MovementBadge
                      dir={r.current.movementDir}
                      pct={r.current.movementPct}
                      onPanel
                      locale={locale}
                      labels={movementLabels}
                    />
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <footer className={styles.foot}>
        <Link href={routes.prices()} className={styles.all}>
          {t('viewAll')}
        </Link>
      </footer>
    </aside>
  );
}
