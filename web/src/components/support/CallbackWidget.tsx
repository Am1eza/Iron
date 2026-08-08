'use client';
/**
 * «تماس بگیرید» — a floating direct-call button on the public site: tapping
 * it dials the landline immediately via `tel:`, same convention as the
 * phone links in Footer/ContactCard. Deliberately NOT a "leave your number"
 * lead-capture form (that's what this used to be) — a button labeled "call
 * us" that instead opened a form to request a callback read as broken.
 * Lead capture by form still lives at `/contact` (`ContactForm`), unchanged.
 */
import { PhoneIcon } from '@/components/primitives/icons';
import styles from './CallbackWidget.module.css';

export function CallbackWidget({ phoneLandline }: { phoneLandline: string }) {
  return (
    <a href={`tel:${phoneLandline}`} className={styles.fab} aria-label="تماس بگیرید">
      <PhoneIcon size={22} />
      <span className={styles.fabLabel}>تماس بگیرید</span>
    </a>
  );
}
