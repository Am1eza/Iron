'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/i18n/actions';
import { LOCALES, LOCALE_LABELS, type AppLocale } from '@/i18n/config';
import { GlobeIcon } from '@/components/primitives/icons';
import styles from './LocaleSwitcher.module.css';

/** Header language switcher — a native <select> for full keyboard/AT support. */
export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('header');
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.wrap} data-pending={pending ? '' : undefined}>
      <GlobeIcon size={18} className={styles.icon} aria-hidden />
      <select
        className={styles.select}
        value={locale}
        disabled={pending}
        aria-label={t('language')}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => {
            void setLocale(next);
          });
        }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
