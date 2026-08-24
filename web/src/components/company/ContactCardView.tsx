'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import { PhoneIcon, HomeIcon, ArrowEndIcon } from '@/components/primitives/icons';
import styles from './ContactCard.module.css';

/**
 * The rendered body of `ContactCard`, split out so its labels can go through
 * the `contactCard` dictionary and follow the client-side locale switch.
 *
 * `ContactCard` itself has to stay an async Server Component — it awaits
 * `getContact()` — and an async component cannot carry `'use client'`, so the
 * fetch stays there and the markup lives here.
 *
 * The office address is NOT translated: it comes from the DB as one Persian
 * string, and a half-translated postal address is worse than a Persian one an
 * Iranian courier can actually read.
 */
export function ContactCardView({
  address,
  phoneLandline,
  phoneMobile,
}: {
  address: string;
  phoneLandline: string;
  phoneMobile: string;
}) {
  const t = useTranslations('contactCard');
  const locale = useLocale();
  // Persian digits are a Persian-rendering convention; the `tel:` href stays
  // Latin/ASCII for diallers either way.
  const dial = (n: string) => (locale === 'fa' ? toPersianDigits(n) : n);

  return (
    <div className={styles.card}>
      <div className={styles.body}>
        <h2 className={styles.title}>{t('title')}</h2>
        <address className={styles.address}>
          <HomeIcon size={18} />
          <span>{address}</span>
        </address>
        <Link href={routes.contact()} className={styles.cta}>
          {t('cta')}
          <ArrowEndIcon size={18} className="icon--rtl" />
        </Link>
      </div>

      <ul className={styles.phones}>
        <li className={styles.phoneRow}>
          <span className={styles.phoneIcon} aria-hidden="true">
            <PhoneIcon size={18} />
          </span>
          <span className={styles.phoneLabel}>{t('landline')}</span>
          <a className={styles.phoneLink} href={`tel:${phoneLandline}`}>
            <bdi>{dial(phoneLandline)}</bdi>
          </a>
        </li>
        <li className={styles.phoneRow}>
          <span className={styles.phoneIcon} aria-hidden="true">
            <PhoneIcon size={18} />
          </span>
          <span className={styles.phoneLabel}>{t('mobile')}</span>
          <a className={styles.phoneLink} href={`tel:${phoneMobile}`}>
            <bdi>{dial(phoneMobile)}</bdi>
          </a>
        </li>
      </ul>
    </div>
  );
}
