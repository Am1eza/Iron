'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { http } from '@/lib/api/http';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { formatToman, priceHiddenLabel, toPersianDigits } from '@/lib/utils/format';
import {
  priceBasisNoun,
  sizeLabel,
  usesDimensions,
  dimensionsLabel,
  weightLabel,
  attributeColumns,
  NOT_APPLICABLE,
  REGION_LABEL,
  BRAND_LABEL,
  factoryLabel,
} from '@/lib/utils/catalogLabels';
import { formatJalali } from '@/lib/utils/jalali';
import { trackGoal } from '@/lib/analytics/track';
import {
  priceSeries as mockSeries,
  relatedRows as mockRelated,
  subName as mockSubName,
} from '@/lib/mock/catalogData';
import { categories } from '@/lib/mock/fixtures';
import type { SubCat } from '@/lib/data/nav';
import type { PriceRow, Category } from '@/lib/types/domain';
import { useTranslations, useLocale } from 'next-intl';
import { getLocalizedSkuName, getLocalizedName } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import type { LogisticsConfig } from '@/lib/data/logistics';
import {
  Breadcrumbs,
  Stack,
  MovementBadge,
  DeliveryBadge,
  Switch,
  Badge,
  IconButton,
  Button,
  Tooltip,
} from '@/components/ui';
import { PriceChart } from './PriceChart';
import { KgQuantityModal } from '@/components/lazy';
import { BulkQuote } from './BulkQuote';
import { ProductImage } from './ProductImage';
import { FactoryLink } from './FactoryLink';
import { productImage } from '@/lib/data/productImages';
import { AlertBellButton } from '@/components/alerts/AlertBellButton';
import {
  HeartIcon,
  ShareIcon,
  PlusIcon,
  InfoIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@/components/primitives/icons';
import styles from './SkuDetail.module.css';

/**
 * SKU detail — the product page. A calm hero (identity + hero price + actions),
 * the price-history chart, a full specs table and related products. VAT recomputes
 * live; favorite gates on auth; share uses the Web Share API with a clipboard
 * fallback. Server passes the resolved `row`; everything here is client-only.
 */
export function SkuDetail({
  row,
  category,
  related: relatedProp,
  series: seriesProp,
  dates: datesProp,
  categoryRows,
  billet,
  subLabel: subLabelProp,
  categorySubs,
  logisticsConfig,
  vatRate = CONSTANTS.VAT_RATE,
}: {
  row: PriceRow;
  /** For `getLocalizedSkuName` (i18n audit follow-up) — see that function's
   *  own comment. Undefined only in the unreachable case where the row's
   *  own category slug doesn't resolve, and the composer already falls back
   *  to the fa `row.name` when this is missing. */
  category?: Category;
  /** Server-provided (live mode); mock fallbacks apply when absent. */
  related?: PriceRow[];
  series?: number[];
  /** Real ISO timestamp per `series` point (live mode only — see
   *  `catalog.priceSeriesWithDates`). Forwarded to `PriceChart`'s x-axis. */
  dates?: string[];
  categoryRows?: PriceRow[];
  /** بورس billet reference (US-03.3) — null when OP hasn't entered one yet. */
  billet?: { value: number; updatedAt: string } | null;
  /** Live sub-category display name (server-resolved) — the mock fixture is
   *  only the mock/dev fallback so admin-created subs label correctly. */
  subLabel?: string;
  /** Live sub-category list for the category (forwarded to BulkQuote). */
  categorySubs?: SubCat[];
  /** Admin-configurable freight/insurance rates (forwarded to BulkQuote). */
  logisticsConfig?: LogisticsConfig;
  /** Live admin-configured VAT rate (`settings.VAT_RATE`) — the hero price's
   *  «با احتساب ارزش افزوده» toggle used to always apply the static
   *  `CONSTANTS.VAT_RATE` default regardless of what an admin actually set,
   *  quoting a wrong VAT-inclusive price the moment the two diverged. Falls
   *  back to the same default only for callers that don't have it yet. */
  vatRate?: number;
}) {
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [vat, setVat] = useState(false);
  const qc = useQueryClient();
  const t = useTranslations('skuDetail');
  const tNav = useTranslations('nav');
  // Reused rather than duplicated under `skuDetail` — same concept
  // (add-to-cart confirmation), same wording, as PriceTable's toast.
  const tPriceTable = useTranslations('priceTable');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  // Falls back to `row.name` (fa) unchanged whenever `category` or the
  // matching sub-category lacks a real translation for this locale — see
  // `getLocalizedSkuName`'s own comment for why a partially-translated name
  // is worse than an honest all-Persian one.
  const displayName = getLocalizedSkuName(
    row,
    category,
    categorySubs?.find((s) => s.slug === row.subCategoryId),
    locale,
  );

  // Funnel measurement gap (conversion audit finding, 2026-08-26): every
  // OTHER trackGoal call site fires at the final submit, so there was no way
  // to see a visitor viewed this product at all before either converting or
  // dropping off. Keyed on row.id so a client-side nav to a different SKU
  // (no full remount under the same layout) still fires once per product.
  useEffect(() => {
    trackGoal('view-product', row.categoryId, row.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  // The real favorites list, shared by cache key with /account's FavoritesList
  // so the two can never disagree. Only fetched for a signed-in visitor — a
  // guest's heart is a login prompt, not a state. This is what makes the
  // starred state SURVIVE a reload; it used to be a local useState(false) that
  // showed a success toast and persisted nothing at all.
  const { data: favData } = useQuery({
    queryKey: queryKeys.myFavorites(),
    queryFn: () => http.get<{ favorites: PriceRow[] }>('/api/me/favorites'),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const faved = (favData?.favorites ?? []).some((f) => f.id === row.id);

  // Was `categories.find(...)` against the static mock fixture list (7
  // hardcoded categories) regardless of live/mock mode — silently wrong for
  // any live category not in that list (e.g. «استیل»/«فلزات رنگی», added to
  // production after this fixture was last synced; see nav.ts's own header
  // comment on that drift). `category` (the real prop, live-DB-backed) is
  // the actual fix; the mock fixture is now used only as a last-resort
  // fallback when no live category was ever passed in (mock-mode preview).
  const categoryName = category
    ? getLocalizedName(category, locale)
    : (categories.find((c) => c.slug === row.categoryId)?.name ?? row.categoryId);
  const subLabelEntity = categorySubs?.find((s) => s.slug === row.subCategoryId);
  const subLabel = subLabelEntity
    ? getLocalizedName(subLabelEntity, locale)
    : (subLabelProp ?? mockSubName(row.categoryId, row.subCategoryId));
  const skuUrl = routes.sku(row.categoryId, row.subCategoryId, row.slug);

  // W23 audit fix: a stale-hidden price's `row.current.price` is a `0`
  // sentinel (see catalogRepo.toPriceRow) — must never be formatted as a
  // real number or fed into the billet-comparison math below.
  const hiddenLabel = priceHiddenLabel(row.current);
  const price = vat ? Math.round(row.current.price * (1 + vatRate)) : row.current.price;

  // US-03.3 — compared against the raw (VAT-free) price: billet itself has
  // no VAT toggle, so the ratio must stay stable regardless of the switch above.
  const billetDiffPct =
    !hiddenLabel && billet && billet.value > 0
      ? ((row.current.price - billet.value) / billet.value) * 100
      : null;

  const crumbs = [
    { label: tNav('home'), href: routes.home() },
    { label: tNav('prices'), href: routes.prices() },
    { label: categoryName, href: routes.category(row.categoryId) },
    ...(subLabel
      ? [{ label: subLabel, href: routes.subCategory(row.categoryId, row.subCategoryId) }]
      : []),
    { label: displayName },
  ];

  const addRowToCart = (qty: number) => {
    add({
      skuId: row.id,
      name: displayName,
      qty,
      unit: row.unit,
      unitPrice: row.current.price,
      priceBasis: row.priceBasis,
      weightKg: row.theoreticalWeightKg,
    });
    trackGoal('add-to-cart', row.categoryId, row.name);
    toast.success(tPriceTable('addedToCart', { name: displayName }), {
      label: tPriceTable('viewCart'),
      href: routes.cart(),
    });
  };

  // «۱ کیلوگرم» is not a purchasable unit for a kg-basis product (audit
  // finding) — ask by شاخه count or direct weight (KgQuantityModal) instead
  // of defaulting straight to qty:1. Every other basis already counts in a
  // real unit (شاخه/برگ/عدد/…), so 1 there is already correct.
  const [kgQtyOpen, setKgQtyOpen] = useState(false);
  const addToCart = () => {
    if (row.priceBasis === 'kg') {
      setKgQtyOpen(true);
      return;
    }
    addRowToCart(1);
  };

  const favMutation = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? http.post(`/api/me/favorites`, { skuId: row.id })
        : http.del(`/api/me/favorites/${encodeURIComponent(row.id)}`),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: queryKeys.myFavorites() });
      toast.success(next ? t('addedToFavorites') : t('removedFromFavorites'));
    },
    onError: () => toast.error(t('favoriteSaveFailed')),
  });

  const toggleFav = () => {
    if (!isAuthenticated) {
      toast.info(tPriceTable('loginToSaveFavorites'), {
        label: tCommon('action.login'),
        href: routes.login(skuUrl),
      });
      return;
    }
    favMutation.mutate(!faved);
  };

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : skuUrl;
    const shareData = {
      title: displayName,
      text: t('shareText', { name: displayName }),
      url,
    };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or share failed → fall through to copy
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t('linkCopied'));
        return;
      } catch {
        // clipboard blocked
      }
    }
    toast.info(t('shareNotSupported'));
  };

  // ورق is sold by thickness, so its `size` column is labelled «ضخامت» —
  // every other category keeps «سایز» (see catalogLabels).
  const sizeCol = sizeLabel(row.categoryId, row.subCategoryId);
  // The shared column is public only in its approved context: ورق
  // width×length, or wall thickness on the three نبشی subs. This gate
  // also prevents a stale value on any unrelated SKU from leaking onto its
  // product page merely because the nullable DB column happens to be filled.
  const showDimensions = usesDimensions(row.categoryId, row.subCategoryId);
  const dimensionsCol = dimensionsLabel(row.categoryId, row.subCategoryId);

  // The same «گرید»/«استاندارد»/«آلیاژ»/profile-length definitions the
  // price table's columns are built from, resolved for THIS product's own
  // sub-category — so a پروفیل استیل spec sheet says «آلیاژ» and a پروفیل Z one
  // says «طول سفارشی», in the same words the table the visitor arrived from
  // used. `NOT_APPLICABLE` can't occur here (the row is always in its own
  // sub-category) but is filtered defensively rather than printed as a dash.
  const attrCols = attributeColumns(row.categoryId, row.subCategoryId);
  // «کارخانه», or «برند» on مانیسمان — resolved for THIS product's own
  // sub-category, in the same words as the table the visitor arrived from
  // (see catalogLabels' factoryLabel).
  const factoryCol = factoryLabel(row.categoryId, row.subCategoryId);
  // The highlights list reads as a phrase rather than a label — «کارخانهٔ
  // فولاد مبارکه» — so the کارخانه form carries its ezafe. «برند» takes none:
  // «برند چینی» is how the trade says it, and an ezafe there would be wrong
  // Persian.
  const factoryPhrase = factoryCol === BRAND_LABEL ? BRAND_LABEL : t('millLabel');
  const attrSpecs = attrCols
    .map((c) => ({ key: c.key, label: c.label, value: c.cell(row) }))
    .filter((a) => a.value !== NOT_APPLICABLE);
  // …so the generic «طول شاخه» row below doesn't print the same fact twice.
  const attrCoversLength = attrCols.some(
    (c) =>
      c.key === 'branchLength' ||
      c.key === 'profileCondition' ||
      c.key === 'length' ||
      c.key === 'customLength',
  );

  // `value` is a node, not a string, so the کارخانه row can be a link to that
  // mill's page — the natural next question on a product page is "what else
  // does this mill make?" and the spec table was a dead end for it.
  const specs: { label: string; value: ReactNode }[] = [
    { label: sizeCol, value: row.size ? toPersianDigits(row.size) : tPriceTable('unknown') },
    // Only once someone has filled it in. There is deliberately no «نامشخص»
    // placeholder: existing ورق rows and all current نبشی rows are
    // mostly/null throughout, and an empty new spec on every product reads as
    // a broken page rather than an unanswered optional question.
    ...(showDimensions && row.dimensions
      ? [{ label: dimensionsCol, value: toPersianDigits(row.dimensions) }]
      : []),
    ...attrSpecs.map((a) => ({ label: a.label, value: a.value })),
    // Only when this product actually has a mill. The پروفیل sub-categories
    // whose stored factory names were fabricated publish none (see
    // catalogLabels.factoryIsMeaningful), and a «کارخانه: نامشخص» row would
    // put the removed distinction straight back on the spec sheet.
    ...(row.factory
      ? [
          {
            label: factoryCol,
            value: <FactoryLink categorySlug={row.categoryId} factory={row.factory} />,
          },
        ]
      : // …and in its place, on those same sub-categories, the producing city
        // the price table now groups by — so a visitor who arrived from the
        // «قیمت پروفیل اصفهان» section finds the same word on the spec sheet
        // instead of the fact silently vanishing. Plain text, not a link:
        // there is no per-region landing page, and it is a reconstruction
        // rather than sourced data (see catalogLabels.regionFromFactory).
        row.region
        ? [{ label: REGION_LABEL, value: row.region }]
        : []),
    {
      label: weightLabel(row.categoryId),
      value: row.theoreticalWeightKg
        ? `${toPersianDigits(row.theoreticalWeightKg)} ${t('kg')}`
        : tPriceTable('unknown'),
    },
    // Only when the catalog actually records one — «طول شاخه» is genuinely
    // 6 m for some نبشی rows and 12 m for others, so a blanket default here
    // would be the same guess the per-SKU column exists to stop.
    ...(row.branchLengthM && !attrCoversLength
      ? [{ label: t('branchLength'), value: `${toPersianDigits(row.branchLengthM)} ${t('meter')}` }]
      : []),
    // Read from the stored denomination, not hard-coded: this said
    // «کیلوگرم» on a لوله مسی sold by the 15-metre coil.
    { label: t('saleUnit'), value: priceBasisNoun(row.priceBasis, row.branchLengthM) },
    { label: tCommon('data.delivery'), value: toPersianDigits(row.current.deliveryTime) },
  ];

  const related = relatedProp ?? mockRelated(row);

  return (
    <Stack gap={8}>
      <Breadcrumbs items={crumbs} />

      {/* ===== Hero ===== */}
      <section className={styles.hero} aria-labelledby="sku-title">
        <div className={styles.heroMain}>
          <div className={styles.identity}>
            <div className={styles.eyebrow}>
              {subLabel ? <Badge tone="neutral">{subLabel}</Badge> : null}
              <span className={styles.crumbCat}>{categoryName}</span>
            </div>
            <h1 id="sku-title" className={styles.title}>
              {displayName}
            </h1>
            <ul className={styles.attrs}>
              {row.size ? (
                <li>
                  {sizeCol} <strong className="tnum">{toPersianDigits(row.size)}</strong>
                </li>
              ) : null}
              {showDimensions && row.dimensions ? (
                <li>
                  {dimensionsCol}{' '}
                  <strong className="tnum">{toPersianDigits(row.dimensions)}</strong>
                </li>
              ) : null}
              {attrCols.map((c) => {
                const value = c.card(row);
                return value ? (
                  <li key={c.key}>
                    {c.label} <strong>{value}</strong>
                  </li>
                ) : null;
              })}
              {row.region ? (
                <li>
                  {REGION_LABEL} <strong>{row.region}</strong>
                </li>
              ) : null}
              {row.factory ? (
                <li>
                  {factoryPhrase}{' '}
                  <FactoryLink categorySlug={row.categoryId} factory={row.factory} />
                </li>
              ) : null}
              {row.theoreticalWeightKg ? (
                <li>
                  {weightLabel(row.categoryId)}{' '}
                  <strong className="tnum">
                    {/* Was Latin "kg" here while every other weight on this same
                        page (specs table below, BulkQuote) spells out «کیلوگرم» —
                        the exact mixed-unit inconsistency the audit flagged. */}
                    {toPersianDigits(row.theoreticalWeightKg)} {t('kg')}
                  </strong>
                </li>
              ) : null}
            </ul>
            {/* The product's own photo when the admin uploaded one, else the
                category stock image. Before W24 `row.imageUrl` was written by
                the panel and read by nobody, so every product in a category
                showed the same picture. Alt text stays honest either way: a
                real per-product photo is described by the SKU's own full
                name, but a shared category stock image describing itself as
                that exact SKU would be a false claim — "نمونه" (sample/
                representative) says what the image actually is while still
                keeping the specific product name for search differentiation
                (SEO audit: every SKU page previously shared one generic alt
                string per category, e.g. "تصویر میلگرد" on all ~180 rebar
                pages). */}
            {row.imageUrl || productImage(row.categoryId) ? (
              <figure className={styles.heroImage}>
                <ProductImage
                  slug={row.categoryId}
                  src={row.imageUrl}
                  name={row.imageUrl ? displayName : t('sampleOf', { name: displayName })}
                  eager
                />
              </figure>
            ) : null}
          </div>

          <div className={styles.priceBox}>
            <span className={styles.priceLabel}>
              {t('pricePerUnit', { basis: priceBasisNoun(row.priceBasis, row.branchLengthM) })}
            </span>
            <div className={styles.priceRow}>
              {hiddenLabel ? (
                <span className={`${styles.priceVal} tnum`}>{hiddenLabel}</span>
              ) : (
                <>
                  <span className={`${styles.priceVal} tnum`}>{formatToman(price, false)}</span>
                  <span className={styles.priceUnit}>{tCommon('unit.currency')}</span>
                </>
              )}
            </div>
            <div className={styles.priceMeta}>
              <MovementBadge dir={row.current.movementDir} pct={row.current.movementPct} pill />
              <DeliveryBadge value={row.current.deliveryTime} />
              {/* Was a lone, muted caption below the VAT row — easy to miss
                  despite being the answer to "is this price still current?".
                  Promoted into the same badge row/visual tier as the movement
                  and delivery signals it sits next to (design/UX audit). */}
              <span className={styles.updated}>
                <ClockIcon size={14} aria-hidden="true" />
                {tPriceTable('updatedAt')} <span className="tnum">{formatJalali(row.current.updatedAt)}</span>
              </span>
            </div>

            {billetDiffPct !== null ? (
              <p className={styles.vatNote} style={{ marginBlockStart: 0 }}>
                {billetDiffPct >= 0
                  ? t('aboveBillet', { pct: toPersianDigits(Math.abs(billetDiffPct).toFixed(1)) })
                  : t('belowBillet', { pct: toPersianDigits(Math.abs(billetDiffPct).toFixed(1)) })}{' '}
                <bdi>
                  ({formatToman(billet!.value, false)} {tCommon('unit.currency')})
                </bdi>
              </p>
            ) : null}

            <div className={styles.vatRow}>
              <Switch checked={vat} onChange={setVat} label={t('vatToggleLabel')} />
              <span className={styles.vatNote}>
                {vat
                  ? t('vatIncludedPct', { pct: toPersianDigits(vatRate * 100) })
                  : t('vatExcludedLabel')}
              </span>
            </div>

            <div className={styles.actions}>
              <Button
                variant="primary"
                onClick={addToCart}
                className={styles.addBtn}
                disabled={Boolean(hiddenLabel)}
                title={hiddenLabel ? t('mustCallForPrice') : undefined}
              >
                <PlusIcon size={18} /> {t('addToCartCta')}
              </Button>
              {/* Icon-only actions already had `aria-label`s (native `title`
                  too, via IconButton) for assistive tech — the audit's point
                  is that a sighted, non-expert visitor has no VISIBLE cue.
                  `Tooltip` is an existing, previously-unused design-system
                  primitive built for exactly this. */}
              <Tooltip content={faved ? t('removeFromFavorites') : t('addToFavorites')}>
                <IconButton
                  variant="subtle"
                  label={faved ? t('removeFromFavorites') : t('addToFavorites')}
                  active={faved}
                  icon={<HeartIcon size={20} filled={faved} />}
                  onClick={toggleFav}
                  disabled={favMutation.isPending}
                />
              </Tooltip>
              <AlertBellButton
                variant="subtle"
                size="md"
                target={{
                  type: 'sku',
                  skuId: row.id,
                  label: displayName,
                  currentValue: row.current.price,
                }}
              />
              <Tooltip content={t('share')}>
                <IconButton
                  variant="subtle"
                  label={t('share')}
                  icon={<ShareIcon size={20} />}
                  onClick={share}
                />
              </Tooltip>
            </div>

            <p className={styles.lead}>
              <InfoIcon size={15} aria-hidden="true" />
              <span>{t('noOnlinePayment')}</span>
            </p>
          </div>
        </div>
      </section>

      {/* ===== Price history ===== */}
      <section className={styles.block} aria-labelledby="chart-title">
        <h2 id="chart-title" className={styles.blockTitle}>
          {t('priceHistoryTitle')}
        </h2>
        <div className={styles.card}>
          <PriceChart
            series={seriesProp ?? mockSeries(row.slug, row.current.price)}
            dates={seriesProp ? datesProp : undefined}
          />
        </div>
      </section>

      {/* ===== Specs ===== */}
      <section className={styles.block} aria-labelledby="specs-title">
        <h2 id="specs-title" className={styles.blockTitle}>
          {t('technicalSpecs')}
        </h2>
        <div className={styles.card}>
          <table className={`${styles.specs} tnum`}>
            <caption className="visually-hidden">{t('technicalSpecsOf', { name: displayName })}</caption>
            <tbody>
              {specs.map((s) => (
                <tr key={s.label}>
                  <th scope="row">{s.label}</th>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.specsNote}>
            <CheckCircleIcon size={15} aria-hidden="true" />
            <span>{t('weightNote')}</span>
          </p>
        </div>
      </section>

      {/* ===== Bulk / per-factory split ===== */}
      {/* Seeded with THIS product's own sub-category and size. Without them
          BulkQuote falls back to `pickBestGroup`, which opens on whichever
          sub-category the most mills quote — on a وال‌پست page that is
          «نبشی», so the panel compared a different product than the one the
          page is about. */}
      <BulkQuote
        category={row.categoryId}
        categoryName={categoryName}
        categoryEntity={category}
        rows={categoryRows}
        subs={categorySubs}
        defaultSub={row.subCategoryId}
        defaultSize={row.size}
        logisticsConfig={logisticsConfig}
        vatRate={vatRate}
      />

      {/* ===== Related ===== */}
      {related.length > 0 ? (
        <section className={styles.block} aria-labelledby="related-title">
          <h2 id="related-title" className={styles.blockTitle}>
            {t('relatedProductsTitle')}
          </h2>
          <ul className={styles.related}>
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                  className={styles.relCard}
                >
                  <span className={styles.relName}>
                    {getLocalizedSkuName(
                      r,
                      category,
                      categorySubs?.find((s) => s.slug === r.subCategoryId),
                      locale,
                    )}
                  </span>
                  <span className={styles.relPriceRow}>
                    <span className={`${styles.relPrice} tnum`}>
                      {priceHiddenLabel(r.current) ?? (
                        <>
                          {formatToman(r.current.price, false)}
                          <span className={styles.relUnit}> {tCommon('unit.currency')}</span>
                        </>
                      )}
                    </span>
                    <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
                  </span>
                  <span className={styles.relFoot}>
                    <DeliveryBadge value={r.current.deliveryTime} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <KgQuantityModal
        open={kgQtyOpen}
        onClose={() => setKgQtyOpen(false)}
        productName={displayName}
        branchWeightKg={row.theoreticalWeightKg}
        unitPrice={row.current.price}
        onConfirm={(qtyKg) => {
          addRowToCart(qtyKg);
          setKgQtyOpen(false);
        }}
      />
    </Stack>
  );
}
