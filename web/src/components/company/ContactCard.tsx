import Link from 'next/link';
import { CONTACT } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import { PhoneIcon, HomeIcon, ArrowEndIcon } from '@/components/primitives/icons';
import styles from './ContactCard.module.css';

/**
 * ContactCard — office address + tappable phone links (tel:) and a primary
 * «تماس» CTA to the contact page. Server component; pulls from CONTACT in seo.
 * Persian digits for display; tel: hrefs stay Latin/ASCII for diallers.
 */
export function ContactCard() {
  return (
    <div className={styles.card}>
      <div className={styles.body}>
        <h2 className={styles.title}>در دسترس شما هستیم</h2>
        <address className={styles.address}>
          <HomeIcon size={18} />
          <span>{CONTACT.address}</span>
        </address>
        <Link href={routes.contact()} className={styles.cta}>
          تماس و ارسال پیام
          <ArrowEndIcon size={18} className="icon--rtl" />
        </Link>
      </div>

      <ul className={styles.phones}>
        <li className={styles.phoneRow}>
          <span className={styles.phoneIcon} aria-hidden="true">
            <PhoneIcon size={18} />
          </span>
          <span className={styles.phoneLabel}>تلفن ثابت</span>
          <a className={styles.phoneLink} href={`tel:${CONTACT.phoneLandline}`}>
            <bdi>{toPersianDigits(CONTACT.phoneLandline)}</bdi>
          </a>
        </li>
        <li className={styles.phoneRow}>
          <span className={styles.phoneIcon} aria-hidden="true">
            <PhoneIcon size={18} />
          </span>
          <span className={styles.phoneLabel}>همراه</span>
          <a className={styles.phoneLink} href={`tel:${CONTACT.phoneMobile}`}>
            <bdi>{toPersianDigits(CONTACT.phoneMobile)}</bdi>
          </a>
        </li>
      </ul>
    </div>
  );
}
