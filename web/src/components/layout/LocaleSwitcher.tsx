'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, LOCALE_LABELS, isAppLocale, type AppLocale } from '@/i18n/config';
import { GlobeIcon } from '@/components/primitives/icons';
import styles from './LocaleSwitcher.module.css';

/**
 * Header language switcher — a native <select> for full keyboard/AT support.
 *
 * Switching language now means NAVIGATING to this same page's other-locale
 * URL (`/prices/rebar` ↔ `/en/prices/rebar`), not flipping client state —
 * see `i18n/routing.ts`'s header comment for why: only a real URL per locale
 * makes hreflang and a server-rendered (flash-free) translation possible.
 * `usePathname`/`useRouter` here are next-intl's locale-aware wrappers
 * (`i18n/navigation.ts`) — `pathname` already comes back locale-neutral, and
 * `router.replace(pathname, {locale})` re-resolves it under the new one.
 */
export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('header');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  return (
    <div className={styles.wrap}>
      <GlobeIcon size={18} className={styles.icon} aria-hidden />
      <select
        className={styles.select}
        value={locale}
        aria-label={t('language')}
        onChange={(e) => {
          const next = e.target.value;
          if (!isAppLocale(next) || next === locale) return;
          const query = searchParams.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { locale: next });
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
