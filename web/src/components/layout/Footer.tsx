import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { FOOTER_COLUMNS, CHANNELS } from '@/lib/data/nav';
import { CONTACT } from '@/lib/seo';
import { localizeDigits } from '@/lib/utils/format';
import type { Category } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { Logo } from './Logo';
import styles from './Footer.module.css';

/**
 * N6 · Footer — grouped link columns (products / tools / company / support /
 * channels) + the trust block (badges, address, click-to-call phones). RTL columns.
 */
export function Footer({ categories }: { categories: Category[] }) {
  const t = useTranslations('footer');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  // Copyright year: the fa locale keeps the deliberate Jalali ۱۴۰۵ (this is a
  // Persian-calendar business, not a raw current-year computation); every
  // other locale shows the actual Gregorian year, which is what a non-Persian
  // reader expects from a "©" line.
  const year = locale === 'fa' ? localizeDigits('۱۴۰۵', locale) : String(new Date().getFullYear());

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.top}`}>
        {/* Brand + tagline */}
        <div className={styles.brandCol}>
          <Logo light />
          <p className={styles.tagline}>{tCommon('tagline')}</p>
          <p className={styles.blurb}>{t('blurb')}</p>
        </div>

        {/* Products column */}
        <nav className={styles.col} aria-label={t('products')}>
          <h2 className={styles.colTitle}>{t('products')}</h2>
          <ul className={styles.links}>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={routes.category(c.slug)} className={styles.link}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Configured columns — data-driven (lib/data/nav.ts); still fa-only
            pending the broader page-content translation pass (see
            GEO-ROUTING.md-adjacent scope note: this session translated the
            shell, not every data source). */}
        {FOOTER_COLUMNS.map((group) => (
          <nav key={group.title} className={styles.col} aria-label={group.title}>
            <h2 className={styles.colTitle}>{group.title}</h2>
            <ul className={styles.links}>
              {group.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className={styles.link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        {/* Contact / trust */}
        <div className={styles.col}>
          <h2 className={styles.colTitle}>{t('contact')}</h2>
          <address className={styles.address}>{CONTACT.address}</address>
          <div className={styles.phones}>
            <a href={`tel:${CONTACT.phoneLandline}`} className={styles.phone} dir="ltr">
              {localizeDigits(CONTACT.phoneLandline, locale)}
            </a>
            <a href={`tel:${CONTACT.phoneMobile}`} className={styles.phone} dir="ltr">
              {localizeDigits(CONTACT.phoneMobile, locale)}
            </a>
          </div>
          <ul className={styles.channels} aria-label={t('channels')}>
            {CHANNELS.map((ch) => (
              <li key={ch.href}>
                <a
                  href={ch.href}
                  className={styles.channel}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ch.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Trust badges + legal strip */}
      <div className={styles.trustStrip}>
        <div className={`container ${styles.trustInner}`}>
          <ul className={styles.badges} aria-label={t('trustBadges')}>
            <li className={styles.badge}>{t('badgeETrust')}</li>
            <li className={styles.badge}>{t('badgeRegistered')}</li>
            <li className={styles.badge}>{t('badgeUnion')}</li>
          </ul>
          <p className={styles.copy}>{t('rights', { year })}</p>
        </div>
      </div>
    </footer>
  );
}
