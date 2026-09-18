import { getTranslations } from 'next-intl/server';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { Text } from '@/components/ui';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { getLocalizedBasisNoun } from '@/lib/utils/localizedNames';
import { formatPriceUpdatedAt, type PriceFacts } from '@/lib/seo/priceFacts';
import type { AppLocale } from '@/i18n/config';

/** Beyond this, the answer names the first N mills and counts the rest. */
const MAX_MILLS_NAMED = 10;

/**
 * «سوالات متداول» for a price page (category or sub-category), answered from
 * the page's own rows (`priceFacts`). The visible disclosure list and the
 * FAQPage JSON-LD come from one `items` array through `ArticleFaq`, the same
 * renderer articles use, so the two can never disagree.
 *
 * Questions are the ones people type into a search box or ask an assistant
 * about a steel product. Every answer is self-contained, because it gets
 * quoted without the page around it:
 *  - today's price → the range over the rows sharing the dominant basis, with
 *    the unit, VAT status and update time spelled out;
 *  - which mills → Persian pages only. Mill names are not translated anywhere
 *    in the catalog, and an English answer listing «ذوب‌آهن اصفهان» helps nobody;
 *  - VAT → how the table itself shows it (the switch's real label);
 *  - how to buy → the lead-gen funnel as it is: no online payment, a
 *    proforma, a human call (CLAUDE.md §1).
 */
export async function PriceFaq({
  facts,
  subject,
  locale,
  vatRate,
}: {
  facts: PriceFacts;
  subject: string;
  locale: AppLocale;
  vatRate: number;
}) {
  const t = await getTranslations({ locale, namespace: 'pricesFacet' });
  const tTable = await getTranslations({ locale, namespace: 'priceTable' });

  const unit =
    locale === 'fa' ? priceBasisNoun(facts.rangeBasis) : getLocalizedBasisNoun(facts.rangeBasis, locale);
  const money = (value: number) => formatToman(value, false, locale);
  const updated = facts.latestAt
    ? t('faqPriceUpdated', { date: formatPriceUpdatedAt(facts.latestAt, locale) })
    : '';

  const items: { question: string; answer: string }[] = [
    {
      question: t('faqPriceQ', { subject }),
      answer:
        (facts.min === facts.max
          ? t('faqPriceSingle', { subject, unit, price: money(facts.min) })
          : t('faqPriceRange', {
              subject,
              unit,
              // A number, not pre-formatted digits: ICU formats it per locale
              // and ar selects the noun form from it (3–10 «منتجات», 11–99
              // «منتجًا») — see PriceFaq.messages.test.ts.
              count: facts.rangeCount,
              min: money(facts.min),
              max: money(facts.max),
            })) + updated,
    },
  ];

  if (locale === 'fa' && facts.factories.length > 0) {
    const named = facts.factories.slice(0, MAX_MILLS_NAMED).join('، ');
    const rest = facts.factories.length - MAX_MILLS_NAMED;
    items.push({
      question: t('faqMillsQ', { subject }),
      answer: t('faqMillsA', {
        subject,
        count: facts.factories.length,
        list: rest > 0 ? t('faqMillsMore', { list: named, rest }) : named,
      }),
    });
  }

  items.push(
    {
      question: t('faqVatQ', { subject }),
      answer: t('faqVatA', {
        toggle: tTable('vatToggle'),
        pct: localizeDigits(Math.round(vatRate * 100), locale),
      }),
    },
    { question: t('faqBuyQ', { subject }), answer: t('faqBuyA') },
  );

  return <ArticleFaq items={items} />;
}

/**
 * «آخرین به‌روزرسانی قیمت‌ها: ۲۷ شهریور ۱۴۰۵ ساعت ۱۰:۰۰», with the moment in
 * a machine-readable `<time datetime>`. Freshness is the single strongest
 * signal on a daily-price page; before this, the only visible date was
 * inside each row.
 */
export async function PriceUpdatedAt({ iso, locale }: { iso: string; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'pricesFacet' });
  return (
    <Text variant="body-sm" color="muted">
      {t.rich('pricesUpdatedAt', {
        date: formatPriceUpdatedAt(iso, locale),
        time: (chunks) => <time dateTime={iso}>{chunks}</time>,
      })}
    </Text>
  );
}
