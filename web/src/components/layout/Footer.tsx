import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { FOOTER_COLUMNS, CHANNELS } from '@/lib/data/nav';
import type { SiteContact } from '@/lib/server/contact';
import { localizeDigits } from '@/lib/utils/format';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import type { Category } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { Logo } from './Logo';
import styles from './Footer.module.css';

/**
 * N6 · Footer — grouped link columns (products / tools / company / support /
 * channels) + the trust block (badges, address, click-to-call phones). RTL columns.
 */
export function Footer({ categories, contact }: { categories: Category[]; contact: SiteContact }) {
  const t = useTranslations('footer');
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const tNavLinks = useTranslations('navLinks');
  const locale = useLocale() as AppLocale;
  // Copyright year: the fa locale keeps the deliberate Jalali ۱۴۰۵ (this is a
  // Persian-calendar business, not a raw current-year computation); every
  // other locale shows the actual Gregorian year, which is what a non-Persian
  // reader expects from a "©" line.
  const year = locale === 'fa' ? localizeDigits('۱۴۰۵', locale) : String(new Date().getFullYear());

  return (
    <footer className={styles.footer} data-site-chrome>
      <div className={`container ${styles.top}`}>
        {/* Brand + tagline */}
        <div className={styles.brandCol}>
          <Logo light />
          <p className={styles.tagline}>{tCommon('tagline')}</p>
        </div>

        {/* Column titles are <p>, deliberately NOT headings. As <h2> they put
            SEVEN footer entries into every page's heading outline — one of
            them «مقالات», competing semantically with the actual content
            section — so a screen-reader user skimming by heading got 7 footer
            items against 2 real ones on /blog. The grouping is already carried
            correctly by <nav aria-label>, which is what does the real
            accessibility work here; the heading semantics added nothing.

            Visual hierarchy (design/UX audit: seven equal-weight columns had
            no priority signal at all): محصولات and تماس are the two links a
            visitor is actually likely to want from a footer — the catalog,
            and the phone numbers this lead-gen site's whole funnel ends at —
            so they keep the full-size title/link treatment. The other five
            (ابزارها/مقالات/خدمات/شرکت/پشتیبانی) are real, still fully
            crawlable nav landmarks — nothing here is hidden or removed, only
            drawn smaller and packed into one denser cluster, same as the
            mega-menu's own `.group { break-inside: avoid }` pattern. */}
        {/* Products column — primary */}
        <nav className={`${styles.col} ${styles.primaryCol}`} aria-label={t('products')}>
          <p className={`${styles.colTitle} ${styles.primaryTitle}`}>{t('products')}</p>
          <ul className={styles.links}>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={routes.category(c.slug)} className={styles.link}>
                  {getLocalizedName(c, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Configured columns — data-driven (lib/data/nav.ts), each link's
            `labelKey` resolved here via next-intl so switching locale
            actually retranslates them (it silently didn't before — see
            nav.ts's header comment). Secondary cluster — see the hierarchy
            note above. */}
        <div className={styles.moreCluster}>
          {FOOTER_COLUMNS.map((group) => (
            <nav key={group.titleKey} className={styles.moreCol} aria-label={tNav(group.titleKey)}>
              <p className={styles.moreTitle}>{tNav(group.titleKey)}</p>
              <ul className={styles.links}>
                {group.links.map((l) => (
                  <li key={l.href + l.labelKey}>
                    <Link href={l.href} className={styles.link}>
                      {tNavLinks(l.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Contact / trust — primary */}
        <div className={`${styles.col} ${styles.primaryCol}`}>
          <p className={`${styles.colTitle} ${styles.primaryTitle}`}>{t('contact')}</p>
          <address className={styles.address}>{contact.address}</address>
          <div className={styles.phones}>
            <a href={`tel:${contact.phoneLandline}`} className={styles.phone} dir="ltr">
              {localizeDigits(contact.phoneLandline, locale)}
            </a>
            <a href={`tel:${contact.phoneMobile}`} className={styles.phone} dir="ltr">
              {localizeDigits(contact.phoneMobile, locale)}
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
                  {tNavLinks(ch.labelKey)}
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
