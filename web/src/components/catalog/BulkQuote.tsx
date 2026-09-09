'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/hooks/useToast';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, localizeDigits } from '@/lib/utils/format';
import { sizeLabel } from '@/lib/utils/catalogLabels';
import { getRows } from '@/lib/mock/catalogData';
import { computeBulkSplit, pickBestGroup } from '@/lib/utils/bulkSplit';
import { MOCK_CATEGORY_SUBS, type SubCat } from '@/lib/data/nav';
import { FactoryLink } from './FactoryLink';
import { DEFAULT_LOGISTICS_CONFIG, cityDistance, estimateLogistics, type LogisticsConfig } from '@/lib/data/logistics';
import { useProfileStore } from '@/lib/stores/profile';
import { CONSTANTS } from '@/lib/config/constants';
import type { PriceRow, Category } from '@/lib/types/domain';
import { useTranslations, useLocale } from 'next-intl';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { PlusIcon, CheckCircleIcon } from '@/components/primitives/icons';
import styles from './BulkQuote.module.css';

// Re-exported so existing imports (AI advisor) keep working from one place.
export { computeBulkSplit } from '@/lib/utils/bulkSplit';
export type { BulkSplit, FactoryLine } from '@/lib/utils/bulkSplit';

const TONNAGE_PRESETS = [10, 20, 50, 100];

/**
 * «مقایسهٔ کارخانه‌ها» — the signature capability. Enter a tonnage and see the
 * same product priced across every mill: proportional price bars, the gap to the
 * cheapest, and what you save by choosing it. Anchored at #compare so the
 * landing teaser, the table toolbar and the cascade menu can deep-link here.
 */
export function BulkQuote({
  category,
  categoryName,
  categoryEntity,
  rows: rowsProp,
  subs: subsProp,
  defaultSub,
  defaultSize,
  defaultTonnage = 20,
  logisticsConfig = DEFAULT_LOGISTICS_CONFIG,
  vatRate = CONSTANTS.VAT_RATE,
}: {
  category: string;
  categoryName: string;
  /** For locale-aware display (i18n audit follow-up) — same `Category` row
   *  `categoryName` was already derived from. Optional so mock/dev callers
   *  that only have the plain string keep working; falls back to
   *  `categoryName` (fa) when absent or untranslated for this locale. */
  categoryEntity?: Category;
  rows?: PriceRow[];
  /** Live sub-categories (server-provided) — fixture fallback is mock/dev only. */
  subs?: SubCat[];
  /** The sub-category this panel should OPEN on, when the host page is about
   *  one specific product (the SKU page). Without it the panel falls back to
   *  `pickBestGroup`, which picks whichever sub-category the most mills quote
   *  — on a وال‌پست page that is «نبشی», so the "compare" panel silently
   *  answered a question about a different product than the one on screen. */
  defaultSub?: string;
  /** Likewise for size, so the SKU page's comparison is same-size where the
   *  data supports it. Cleared automatically if that size isn't quoted in the
   *  seeded sub-category, so seeding can never empty the panel. */
  defaultSize?: string;
  defaultTonnage?: number;
  /** Admin-configurable freight/insurance/handling rates + city list, fetched
   *  server-side from `settings.LOGISTICS` and passed down — falls back to
   *  the same defaults `landedCost` uses when a caller doesn't have it yet. */
  logisticsConfig?: LogisticsConfig;
  /** Live admin-configured VAT rate (`settings.VAT_RATE`, via `getVatRate()`)
   *  — server-provided so this stays in sync with `landedCost`, which already
   *  uses the live rate. Falls back to the static default only for callers
   *  that don't have it yet. */
  vatRate?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const add = useCartStore((s) => s.add);
  const addRequest = useRequestsStore((s) => s.add);
  const { requireAuth } = useRequireAuth();
  const t = useTranslations('bulkQuote');
  const tPriceTable = useTranslations('priceTable');
  const locale = useLocale() as AppLocale;
  const displayCategoryName = categoryEntity ? getLocalizedName(categoryEntity, locale) : categoryName;
  const [tonnage, setTonnage] = useState<number>(defaultTonnage);
  const [sub, setSub] = useState<string>(defaultSub ?? '');
  const sizeCol = sizeLabel(category, sub || null);
  const [size, setSize] = useState<string>('');
  const warehouseCity = useProfileStore((s) => s.warehouseCity);
  const setWarehouseCity = useProfileStore((s) => s.setWarehouseCity);
  const city = warehouseCity ?? 'تهران';

  const allRows = useMemo(() => rowsProp ?? getRows(category), [rowsProp, category]);
  // Live subs come from the server page; the fixture is the mock/dev fallback.
  const subs = subsProp ?? MOCK_CATEGORY_SUBS[category] ?? [];

  // Averaging a mill's price across entirely different sub-categories (e.g.
  // میلگرد «ساده» blended with «آجدار A3») blends non-equivalent products
  // into a misleading "cheapest" — so instead of opening on the unfiltered
  // (blended) view, default to the single most-quoted sub-category the
  // moment rows are available. The user can still pick «همه» explicitly for
  // the broader, averaged view. Deliberately doesn't also auto-pick a size:
  // real data showed one exact size is often quoted by only one mill, which
  // would collapse the comparison to a single factory almost every time.
  //
  // When the host page IS one specific product (`defaultSub`), that product's
  // own sub-category wins outright — auto-picking is for the category/landing
  // surfaces, which have no product to be about.
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (autoPicked || allRows.length === 0) return;
    if (defaultSub) {
      // Seeded from the product itself; nothing to infer.
      setAutoPicked(true);
      return;
    }
    const group = pickBestGroup(allRows);
    if (group?.subCategoryId) setSub(group.subCategoryId);
    setAutoPicked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, autoPicked, defaultSub]);

  // Size-aware comparison: same sub-family AND same size across mills — an
  // apples-to-apples benchmark instead of category averages.
  const subRows = useMemo(
    () => (sub ? allRows.filter((r) => r.subCategoryId === sub) : allRows),
    [allRows, sub],
  );
  const sizes = useMemo(
    () => [...new Set(subRows.map((r) => r.size).filter((s): s is string => Boolean(s)))],
    [subRows],
  );
  const rows = useMemo(
    () => (size ? subRows.filter((r) => r.size === size) : subRows),
    [subRows, size],
  );

  // Seed the size from the host product, but only once the seeded
  // sub-category's sizes are known and only if this size is actually quoted
  // there — otherwise the panel would open on an empty comparison.
  const [sizeSeeded, setSizeSeeded] = useState(false);
  useEffect(() => {
    if (sizeSeeded || !defaultSize) return;
    if (sizes.length === 0) return;
    if (sizes.includes(defaultSize)) setSize(defaultSize);
    setSizeSeeded(true);
  }, [sizeSeeded, defaultSize, sizes]);

  const split = useMemo(() => computeBulkSplit(rows, tonnage), [rows, tonnage]);

  // Nothing to compare, and — for پروفیل — nobody to compare. This whole panel
  // asks one question ("which mill is cheapest for N tonnes?"), so on a
  // category whose rows carry no mill it has no question to ask: every row
  // would fall into one «سایر» bucket and the page would recommend «تأمین از
  // کارخانهٔ سایر», which is the fabricated distinction wearing a different
  // name. It reappears by itself the moment a real factory is priced here.
  if (allRows.length === 0 || !allRows.some((r) => r.factory)) return null;

  // W25 audit fix: this panel prices «تناژ × قیمت هر کیلوگرم», which is only
  // meaningful for kg-priced products. On a per-قطعه / per-کلاف / per-برگ /
  // per-متر-مربع product (47 active SKUs) a tonnage has no relationship to
  // the stored price at all, so there is no honest number to show and the
  // panel removes itself rather than invent one. `computeBulkSplit` drops
  // those rows too, so this is the visible half of the same rule.
  if (!allRows.some((r) => !r.current.priceHidden && !r.current.priceIsEstimated && (r.current.priceBasis ?? r.priceBasis ?? 'kg') === 'kg')) {
    return null;
  }

  const most = split.lines[split.lines.length - 1] ?? null;
  const runnerUp = split.lines.find((l) => l.factory !== split.cheapest?.factory) ?? null;
  // Two DIFFERENT numbers, kept explicitly distinct (and distinctly worded
  // below) so they never get conflated: how much you save vs the very next
  // option — the AI advisor quotes this exact same figure — and the wider
  // gap to the priciest option, for full context.
  const savingsVsNext = split.cheapest && runnerUp ? runnerUp.lineToman - split.cheapest.lineToman : 0;
  const savingsVsMax =
    split.cheapest && most && most.factory !== split.cheapest.factory
      ? most.lineToman - split.cheapest.lineToman
      : 0;

  // Landed cost from the Shadabad warehouse to the buyer's city. Fallback km
  // and VAT rate match `landedCost` (estimate.service.ts) exactly — an
  // unmatched city or a stale VAT constant used to quote a cheaper estimate
  // here than the server would actually charge.
  const km = cityDistance(city, logisticsConfig.cities) ?? 150;
  const landed = split.cheapest
    ? estimateLogistics(split.tonnage, km, split.cheapest.lineToman, vatRate, logisticsConfig)
    : null;

  const addToInquiry = () => {
    const best = split.cheapest;
    if (!best) return;
    add({
      skuId: `bulk-${category}-${best.factory}`,
      name: t('bulkCartItemName', { name: displayCategoryName, factory: best.factory }),
      qty: split.totalKg,
      unit: 'kg',
      unitPrice: best.pricePerKg,
      priceBasis: 'kg',
      weightKg: split.totalKg,
    });
    toast.success(t('addedToCart'), {
      label: tPriceTable('viewCart'),
      href: routes.cart(),
    });
  };

  return (
    <section id="compare" className={styles.panel} aria-labelledby="bulk-title">
      <header className={styles.head}>
        <div>
          <h2 id="bulk-title" className={styles.title}>
            {t('title')}
          </h2>
          <p className={styles.sub}>{t('subtitle', { name: displayCategoryName })}</p>
        </div>
      </header>

      <div className={styles.controls}>
        {/* Locked on a product page: the host passes only that product's own
            sub-category rows, so offering the other sub-categories here would
            switch to a selection that has no rows behind it. Category and
            landing surfaces still get the full selector. */}
        {!defaultSub && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('subCategoryLabel')}</span>
            <select
              className={styles.select}
              value={sub}
              onChange={(e) => {
                setSub(e.target.value);
                setSize('');
              }}
              aria-label={t('subCategoryAria')}
            >
              <option value="">{t('allAverage')}</option>
              {subs.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {getLocalizedName(s, locale)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{sizeCol}</span>
          <select
            className={styles.select}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            aria-label={t('sizeAria', { sizeCol })}
          >
            <option value="">{t('allSizesAverage', { sizeCol })}</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('tonnageLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={tonnage}
            onChange={(e) => {
              const n = Number(e.target.value);
              setTonnage(Number.isFinite(n) && n > 0 ? n : 0);
            }}
            className={styles.input}
            aria-label={t('tonnageAria')}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('cityLabel')}</span>
          <select
            className={styles.select}
            value={city}
            onChange={(e) => setWarehouseCity(e.target.value)}
            aria-label={t('cityAria')}
          >
            {logisticsConfig.cities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.presets} role="group" aria-label={t('presetTonnagesAria')}>
          {TONNAGE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={styles.preset}
              aria-pressed={tonnage === preset}
              data-active={tonnage === preset ? '' : undefined}
              onClick={() => setTonnage(preset)}
            >
              {toPersianDigits(preset)} {t('tonUnit')}
            </button>
          ))}
        </div>
      </div>

      {size && (
        <p className={styles.exactNote}>
          {t('exactCompareNote', {
            sub: subs.find((s) => s.slug === sub) ? getLocalizedName(subs.find((s) => s.slug === sub)!, locale) : displayCategoryName,
            sizeCol,
            size,
          })}
        </p>
      )}

      {/* Says what was left out, rather than letting the comparison imply it
          covered every row in the selection. See computeBulkSplit. */}
      {split.excludedNonKg > 0 && (
        <p className={styles.exactNote}>
          {t('excludedNonKgNote', { count: toPersianDigits(split.excludedNonKg) })}
        </p>
      )}

      <div className={styles.tableScroll} role="region" aria-label={t('title')} tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">
            {t('tableCaption', { name: displayCategoryName, tonnage: toPersianDigits(split.tonnage) })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('factoryColumn')}</th>
              <th scope="col" className={styles.num}>{t('pricePerKgColumn')}</th>
              <th scope="col" className={styles.num}>{t('deltaColumn')}</th>
              <th scope="col" className={styles.num}>
                {t('costColumn', { tonnage: toPersianDigits(split.tonnage) })}
              </th>
            </tr>
          </thead>
          <tbody>
            {split.lines.map((l) => {
              const delta = split.cheapest ? l.pricePerKg - split.cheapest.pricePerKg : 0;
              return (
                <tr key={l.factory} className={l.best ? styles.bestRow : undefined}>
                  <th scope="row" className={styles.factoryCell}>
                    <span className={styles.factoryName}>
                      <FactoryLink categorySlug={category} factory={l.factory} />
                    </span>
                    {l.best ? <span className={styles.bestTag}>{t('cheapestTag')}</span> : null}
                    <span className={styles.rowCount}>
                      {t('basedOnPrices', { count: toPersianDigits(l.rowCount) })}
                    </span>
                  </th>
                  <td className={styles.num}>{formatToman(l.pricePerKg, false)}</td>
                  <td className={`${styles.num} ${l.best ? styles.deltaBest : styles.delta}`}>
                    {l.best ? localizeDigits(0, locale) : `${formatToman(delta, false)}+`}
                  </td>
                  <td className={`${styles.num} ${styles.lineCost}`}>{formatToman(l.lineToman, false)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {split.cheapest ? (
        <p className={styles.suggest}>
          <CheckCircleIcon size={15} aria-hidden="true" />
          <span>
            {t('suggestPrefix')} <strong>{split.cheapest.factory}</strong>{' '}
            {t('suggestPriceLead')}{' '}
            <strong className="tnum">{formatToman(split.cheapest.pricePerKg, false)}</strong>{' '}
            {t('suggestPerKgTotalLead')}{' '}
            <strong className="tnum">{formatToman(split.cheapest.lineToman)}</strong>
            {split.cheapest.rowCount === 1 ? ` ${t('singlePriceNote')}` : ''}.
            {savingsVsNext > 0 ? (
              <>
                {' '}
                {t('savingsVsNextLead')}{' '}
                <strong className="tnum">{formatToman(savingsVsNext)}</strong> {t('savingsVsNextTail')}
              </>
            ) : null}
            {savingsVsMax > savingsVsNext ? (
              <>
                {' '}
                {t('savingsVsMaxLead')}{' '}
                <strong className="tnum">{formatToman(savingsVsMax)}</strong> {t('savingsVsMaxTail')}
              </>
            ) : null}
          </span>
        </p>
      ) : (
        <p className={styles.suggest}>{t('noRowsForSelection', { sizeCol })}</p>
      )}

      {landed && split.cheapest ? (
        <div className={styles.landed}>
          <h3 className={styles.landedTitle}>
            {t('landedTitle', { city })}
            <span className={styles.landedOrigin}>{t('shippedFrom', { origin: logisticsConfig.originLabel })}</span>
          </h3>
          <dl className={styles.landedGrid}>
            <div className={styles.landedRow}>
              <dt>{t('goodsLabel', { factory: split.cheapest.factory })}</dt>
              <dd className="tnum">{formatToman(split.cheapest.lineToman)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>{t('freightLabel', { km: toPersianDigits(km) })}</dt>
              <dd className="tnum">{formatToman(landed.freight)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>{t('handlingLabel')}</dt>
              <dd className="tnum">{formatToman(landed.handling)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>{t('insuranceScaleLabel')}</dt>
              <dd className="tnum">{formatToman(landed.insurance + landed.scale)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>{t('packagingLabel')}</dt>
              <dd className="tnum">{landed.packaging > 0 ? formatToman(landed.packaging) : t('notApplicableZero')}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>{t('vatLabel', { pct: toPersianDigits(Math.round(vatRate * 100)) })}</dt>
              <dd className="tnum">{formatToman(landed.vat)}</dd>
            </div>
            <div className={`${styles.landedRow} ${styles.landedTotal}`}>
              <dt>{t('approxTotalLabel')}</dt>
              <dd className="tnum">{formatToman(landed.total)}</dd>
            </div>
          </dl>
          <p className={styles.landedMeta}>
            {t('approxDeliveryLabel')} <strong>{landed.delivery}</strong>
          </p>
          <p className={styles.landedMeta}>{t('landedDisclaimer')}</p>
          {!logisticsConfig.verifiedAt || Date.now() - new Date(logisticsConfig.verifiedAt).getTime() > 30 * 86_400_000 ? (
            <p className={styles.landedMeta} role="status">
              {t('staleRatesWarning')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          onClick={() =>
            // Requests live in the profile: sign in first, then file it there.
            requireAuth(() => {
              const best = split.cheapest;
              addRequest({
                type: 'bulk',
                title: t('requestTitle', { name: displayCategoryName, tonnage: toPersianDigits(split.tonnage) }),
                detail: best
                  ? t('requestDetail', { factory: best.factory, price: formatToman(best.pricePerKg, false) })
                  : undefined,
              });
              toast.success(t('proformaRequested'));
              router.push(routes.account('requests'));
            })
          }
        >
          {t('getProforma')}
        </button>
        <button type="button" className={styles.ghost} onClick={addToInquiry}>
          <PlusIcon size={16} /> {t('addToCart')}
        </button>
      </div>

      <p className={styles.note}>{t('footerNote')}</p>
    </section>
  );
}
