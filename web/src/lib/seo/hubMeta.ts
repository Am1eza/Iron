import { formatToman } from '@/lib/utils/format';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { getLocalizedBasisNoun } from '@/lib/utils/localizedNames';
import { formatPriceDate, type PriceFacts } from '@/lib/seo/priceFacts';
import type { AppLocale } from '@/i18n/config';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The title and snippet of a price page, built like the ones that hold page one
 * for «قیمت X امروز»: the head keyword («امروز»), the day the prices were last
 * confirmed, and — in the snippet — the real range. The date is the newest
 * confirmation among the priced rows (`priceFacts.latestAt`), NOT the render
 * date: a page that says «۲۸ شهریور» over prices confirmed on the 26th would be
 * claiming a freshness it does not have.
 *
 * Null when the page has no confirmed price (nothing to date or range), so the
 * caller keeps its plain title.
 */
export function hubMeta(
  t: Translate,
  subject: string,
  facts: PriceFacts | null,
  locale: AppLocale,
): { title: string; description: string } | null {
  if (!facts || !facts.latestAt) return null;
  const date = formatPriceDate(facts.latestAt, locale);
  const unit =
    locale === 'fa' ? priceBasisNoun(facts.rangeBasis) : getLocalizedBasisNoun(facts.rangeBasis, locale);
  const money = (v: number) => formatToman(v, false, locale);
  return {
    title: t('hubTitle', { subject, date }),
    description: t('hubDescription', { subject, date, unit, min: money(facts.min), max: money(facts.max) }),
  };
}
