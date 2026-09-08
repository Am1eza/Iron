'use client';
/**
 * «تماس بگیرید» — a floating direct-call button on the public site: tapping
 * it dials the landline immediately via `tel:`, same convention as the
 * phone links in Footer/ContactCard. Deliberately NOT a "leave your number"
 * lead-capture form (that's what this used to be) — a button labeled "call
 * us" that instead opened a form to request a callback read as broken.
 * Lead capture by form still lives at `/contact` (`ContactForm`), unchanged.
 */
import { useTranslations } from 'next-intl';
import { PhoneIcon } from '@/components/primitives/icons';
import styles from './CallbackWidget.module.css';

export function CallbackWidget({ phoneLandline }: { phoneLandline: string }) {
  const t = useTranslations('common');
  return (
    <a href={`tel:${phoneLandline}`} className={styles.fab} aria-label={t('action.call')}>
      <PhoneIcon size={22} />
      <span className={styles.fabLabel}>{t('action.call')}</span>
    </a>
  );
}
