'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useSetLocale } from '@/i18n/LocaleProvider';
import { LOCALES, LOCALE_LABELS, isAppLocale, type AppLocale } from '@/i18n/config';
import { GlobeIcon } from '@/components/primitives/icons';
import styles from './LocaleSwitcher.module.css';

/**
 * Header language switcher — a native <select> for full keyboard/AT support.
 * Switches instantly, client-side (see LocaleProvider) — no server round-trip.
 */
export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('header');
  const setLocale = useSetLocale();

  return (
    <div className={styles.wrap}>
      <GlobeIcon size={18} className={styles.icon} aria-hidden />
      <select
        className={styles.select}
        value={locale}
        aria-label={t('language')}
        onChange={(e) => {
          if (isAppLocale(e.target.value)) setLocale(e.target.value);
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
