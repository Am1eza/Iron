import Link from 'next/link';
import { routes } from '@/lib/routes';
import { FOOTER_COLUMNS, CHANNELS } from '@/lib/data/nav';
import { CONTACT } from '@/lib/seo';
import { toPersianDigits } from '@/lib/utils/format';
import type { Category } from '@/lib/types/domain';
import { Logo } from './Logo';
import styles from './Footer.module.css';

/**
 * N6 · Footer — grouped link columns (products / tools / company / support /
 * channels) + the trust block (badges, address, click-to-call phones). RTL columns.
 */
export function Footer({ categories }: { categories: Category[] }) {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.top}`}>
        {/* Brand + tagline */}
        <div className={styles.brandCol}>
          <Logo />
          <p className={styles.tagline}>اول مشورت، بعد خرید.</p>
          <p className={styles.blurb}>
            بازار هوشمند آهن و فولاد: مشاور هوش مصنوعی، قیمت‌های شفاف و زمان تحویل مشخص.
          </p>
        </div>

        {/* Products column */}
        <nav className={styles.col} aria-label="محصولات">
          <h2 className={styles.colTitle}>محصولات</h2>
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

        {/* Configured columns */}
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
          <h2 className={styles.colTitle}>تماس</h2>
          <address className={styles.address}>{CONTACT.address}</address>
          <div className={styles.phones}>
            <a href={`tel:${CONTACT.phoneLandline}`} className={styles.phone} dir="ltr">
              {toPersianDigits(CONTACT.phoneLandline)}
            </a>
            <a href={`tel:${CONTACT.phoneMobile}`} className={styles.phone} dir="ltr">
              {toPersianDigits(CONTACT.phoneMobile)}
            </a>
          </div>
          <ul className={styles.channels} aria-label="کانال‌ها">
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
          <ul className={styles.badges} aria-label="نمادهای اعتماد">
            <li className={styles.badge}>نماد اعتماد الکترونیکی</li>
            <li className={styles.badge}>ساماندهی</li>
            <li className={styles.badge}>اتحادیه آهن‌فروشان</li>
          </ul>
          <p className={styles.copy}>
            © {toPersianDigits('۱۴۰۵')} آهن‌تایم — همهٔ حقوق محفوظ است.
          </p>
        </div>
      </div>
    </footer>
  );
}
