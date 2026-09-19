import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import { formatDisplayDate } from '@/lib/utils/jalali';
import { localizeCatalogText, localizeValue } from '@/lib/utils/catalogI18n';
import { localizedFactoryName } from '@/lib/utils/factoryNames';

/**
 * Locale-bound display helpers for the public catalog pages — digits, Toman,
 * dates, Persian-first labels/values and mill names, all following the page's
 * locale so an /en, /ar or /zh price page never shows Persian digits, a Jalali
 * year or a Persian column header. For `fa` every helper is the historical
 * Persian output, so the Persian pages and the admin panel are unchanged.
 */
export function useCatalogFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      /** Digits (and separators) in the locale's numerals. */
      num: (value: string | number) => localizeDigits(value, locale),
      /** «۱٬۲۳۴٬۵۶۰» / «1,234,560», optionally with the unit word. */
      toman: (value: number, withUnit = false) =>
        withUnit && locale !== 'fa'
          ? `${formatToman(value, false, locale)} ${localizeCatalogText('تومان', locale)}`
          : formatToman(value, withUnit, locale),
      /** Jalali for fa, Gregorian for every other locale. */
      date: (value: Date | string, pattern?: string) => formatDisplayDate(value, pattern, locale),
      /** A Persian-first catalog label or value, translated (or as-is for fa). */
      text: (value: string) => localizeCatalogText(value, locale),
      /** A stored data value (size, dimensions, delivery, …): Persian digits for
       *  fa (as before), translated words + Latin digits for the rest. */
      val: (value: string | number) => localizeValue(value, locale),
      /** A mill / origin name, in Latin for en and zh when one is on file. */
      factory: (name: string) => localizedFactoryName(name, locale),
    }),
    [locale],
  );
}
