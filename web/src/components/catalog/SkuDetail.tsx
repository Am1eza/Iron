'use client';
import { useState } from 'react';
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
import { priceBasisNoun, sizeLabel, DIMENSIONS_LABEL } from '@/lib/utils/catalogLabels';
import { formatJalali } from '@/lib/utils/jalali';
import { priceSeries as mockSeries, relatedRows as mockRelated, subName as mockSubName } from '@/lib/mock/catalogData';
import { categories } from '@/lib/mock/fixtures';
import type { SubCat } from '@/lib/data/nav';
import type { PriceRow } from '@/lib/types/domain';
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
} from '@/components/ui';
import { PriceChart } from './PriceChart';
import { BulkQuote } from './BulkQuote';
import { ProductImage } from './ProductImage';
import { productImage } from '@/lib/data/productImages';
import { AlertBellButton } from '@/components/alerts/AlertBellButton';
import {
  HeartIcon,
  ShareIcon,
  PlusIcon,
  InfoIcon,
  CheckCircleIcon,
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
  related: relatedProp,
  series: seriesProp,
  categoryRows,
  billet,
  subLabel: subLabelProp,
  categorySubs,
  logisticsConfig,
  vatRate = CONSTANTS.VAT_RATE,
}: {
  row: PriceRow;
  /** Server-provided (live mode); mock fallbacks apply when absent. */
  related?: PriceRow[];
  series?: number[];
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

  const cat = categories.find((c) => c.slug === row.categoryId);
  const categoryName = cat?.name ?? row.categoryId;
  const subLabel = subLabelProp ?? mockSubName(row.categoryId, row.subCategoryId);
  const skuUrl = routes.sku(row.categoryId, row.subCategoryId, row.slug);

  // W23 audit fix: a stale-hidden price's `row.current.price` is a `0`
  // sentinel (see catalogRepo.toPriceRow) — must never be formatted as a
  // real number or fed into the billet-comparison math below.
  const hiddenLabel = priceHiddenLabel(row.current);
  const price = vat
    ? Math.round(row.current.price * (1 + vatRate))
    : row.current.price;

  // US-03.3 — compared against the raw (VAT-free) price: billet itself has
  // no VAT toggle, so the ratio must stay stable regardless of the switch above.
  const billetDiffPct =
    !hiddenLabel && billet && billet.value > 0 ? ((row.current.price - billet.value) / billet.value) * 100 : null;

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'قیمت‌ها', href: routes.prices() },
    { label: categoryName, href: routes.category(row.categoryId) },
    ...(subLabel
      ? [{ label: subLabel, href: routes.subCategory(row.categoryId, row.subCategoryId) }]
      : []),
    { label: row.name },
  ];

  const addToCart = () => {
    add({
      skuId: row.id,
      name: row.name,
      qty: 1,
      unit: row.unit,
      unitPrice: row.current.price,
      weightKg: row.theoreticalWeightKg,
    });
    toast.success(`${row.name} به سبد استعلام اضافه شد.`, {
      label: 'مشاهده سبد',
      href: routes.cart(),
    });
  };

  const favMutation = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? http.post(`/api/me/favorites`, { skuId: row.id })
        : http.del(`/api/me/favorites/${encodeURIComponent(row.id)}`),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: queryKeys.myFavorites() });
      toast.success(next ? 'به علاقه‌مندی‌ها اضافه شد.' : 'از علاقه‌مندی‌ها حذف شد.');
    },
    onError: () => toast.error('ذخیرهٔ علاقه‌مندی انجام نشد. دوباره تلاش کنید.'),
  });

  const toggleFav = () => {
    if (!isAuthenticated) {
      toast.info('برای ذخیرهٔ علاقه‌مندی‌ها وارد شوید.', {
        label: 'ورود',
        href: routes.login(skuUrl),
      });
      return;
    }
    favMutation.mutate(!faved);
  };

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : skuUrl;
    const shareData = {
      title: row.name,
      text: `قیمت روز ${row.name} در آهن‌تایم`,
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
        toast.success('نشانی صفحه کپی شد.');
        return;
      } catch {
        // clipboard blocked
      }
    }
    toast.info('امکان اشتراک‌گذاری در این مرورگر نیست.');
  };

  // ورق is sold by thickness, so its `size` column is labelled «ضخامت» —
  // every other category keeps «سایز» (see catalogLabels).
  const sizeCol = sizeLabel(row.categoryId);

  const specs: { label: string; value: string }[] = [
    { label: sizeCol, value: row.size ? toPersianDigits(row.size) : 'نامشخص' },
    // ورق only, and only once someone has filled it in. Unlike the rows below
    // there is deliberately no «نامشخص» placeholder: most sheet SKUs have no
    // dimensions recorded yet, and a spec table full of «نامشخص» reads as a
    // broken page rather than an unanswered question.
    ...(row.dimensions ? [{ label: DIMENSIONS_LABEL, value: toPersianDigits(row.dimensions) }] : []),
    {
      label: row.categoryId === 'rebar' ? 'گرید' : 'گرید / استاندارد',
      value: row.grade ?? row.standard ?? 'نامشخص',
    },
    { label: 'کارخانه', value: row.factory ?? 'نامشخص' },
    {
      label: 'وزن شاخه',
      value: row.theoreticalWeightKg
        ? `${toPersianDigits(row.theoreticalWeightKg)} کیلوگرم`
        : 'نامشخص',
    },
    // Only when the catalog actually records one — «طول شاخه» is genuinely
    // 6 m for some نبشی rows and 12 m for others, so a blanket default here
    // would be the same guess the per-SKU column exists to stop.
    ...(row.branchLengthM
      ? [{ label: 'طول شاخه', value: `${toPersianDigits(row.branchLengthM)} متر` }]
      : []),
    // Read from the stored denomination, not hard-coded: this said
    // «کیلوگرم» on a لوله مسی sold by the 15-metre coil.
    { label: 'واحد فروش', value: priceBasisNoun(row.priceBasis, row.branchLengthM) },
    { label: 'زمان تحویل', value: toPersianDigits(row.current.deliveryTime) },
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
              {row.name}
            </h1>
            <ul className={styles.attrs}>
              {row.size ? (
                <li>
                  {sizeCol} <strong className="tnum">{toPersianDigits(row.size)}</strong>
                </li>
              ) : null}
              {row.dimensions ? (
                <li>
                  {DIMENSIONS_LABEL} <strong className="tnum">{toPersianDigits(row.dimensions)}</strong>
                </li>
              ) : null}
              {row.grade || row.standard ? <li>گرید {row.grade ?? row.standard}</li> : null}
              {row.factory ? <li>کارخانهٔ {row.factory}</li> : null}
              {row.theoreticalWeightKg ? (
                <li>
                  وزن شاخه{' '}
                  <strong className="tnum">
                    {toPersianDigits(row.theoreticalWeightKg)} <bdi lang="en">kg</bdi>
                  </strong>
                </li>
              ) : null}
            </ul>
            {/* The product's own photo when the admin uploaded one, else the
                category stock image. Before W24 `row.imageUrl` was written by
                the panel and read by nobody, so every product in a category
                showed the same picture. */}
            {row.imageUrl || productImage(row.categoryId) ? (
              <figure className={styles.heroImage}>
                <ProductImage
                  slug={row.categoryId}
                  src={row.imageUrl}
                  name={row.imageUrl ? row.name : categoryName}
                  eager
                />
              </figure>
            ) : null}
          </div>

          <div className={styles.priceBox}>
            <span className={styles.priceLabel}>
              قیمت هر {priceBasisNoun(row.priceBasis, row.branchLengthM)}
            </span>
            <div className={styles.priceRow}>
              {hiddenLabel ? (
                <span className={`${styles.priceVal} tnum`}>{hiddenLabel}</span>
              ) : (
                <>
                  <span className={`${styles.priceVal} tnum`}>{formatToman(price, false)}</span>
                  <span className={styles.priceUnit}>تومان</span>
                </>
              )}
            </div>
            <div className={styles.priceMeta}>
              <MovementBadge dir={row.current.movementDir} pct={row.current.movementPct} pill />
              <DeliveryBadge value={row.current.deliveryTime} />
            </div>

            {billetDiffPct !== null ? (
              <p className={styles.vatNote} style={{ marginBlockStart: 0 }}>
                {billetDiffPct >= 0
                  ? `٪${toPersianDigits(Math.abs(billetDiffPct).toFixed(1))} بالاتر از قیمت پایهٔ شمش بورس`
                  : `٪${toPersianDigits(Math.abs(billetDiffPct).toFixed(1))} پایین‌تر از قیمت پایهٔ شمش بورس`}{' '}
                <bdi>({formatToman(billet!.value, false)} تومان)</bdi>
              </p>
            ) : null}

            <div className={styles.vatRow}>
              <Switch checked={vat} onChange={setVat} label="با احتساب ارزش افزوده" />
              <span className={styles.vatNote}>
                {vat
                  ? `شامل ${toPersianDigits(vatRate * 100)}٪ مالیات بر ارزش افزوده`
                  : 'بدون احتساب ارزش افزوده'}
              </span>
            </div>

            <p className={styles.updated}>
              به‌روزرسانی: {formatJalali(row.current.updatedAt)}
            </p>

            <div className={styles.actions}>
              <Button
                variant="primary"
                onClick={addToCart}
                className={styles.addBtn}
                disabled={Boolean(hiddenLabel)}
                title={hiddenLabel ? 'برای این کالا باید تماس بگیرید.' : undefined}
              >
                <PlusIcon size={18} /> افزودن به سبد استعلام
              </Button>
              <IconButton
                variant="subtle"
                label={faved ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
                active={faved}
                icon={<HeartIcon size={20} filled={faved} />}
                onClick={toggleFav}
                disabled={favMutation.isPending}
              />
              <AlertBellButton
                variant="subtle"
                size="md"
                target={{ type: 'sku', skuId: row.id, label: row.name, currentValue: row.current.price }}
              />
              <IconButton
                variant="subtle"
                label="اشتراک‌گذاری"
                icon={<ShareIcon size={20} />}
                onClick={share}
              />
            </div>

            <p className={styles.lead}>
              <InfoIcon size={15} aria-hidden="true" />
              <span>
                پرداخت آنلاین نداریم؛ پس از ثبت، کارشناس برای نهایی‌کردن قیمت و تحویل تماس می‌گیرد.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ===== Price history ===== */}
      <section className={styles.block} aria-labelledby="chart-title">
        <h2 id="chart-title" className={styles.blockTitle}>
          روند قیمت
        </h2>
        <div className={styles.card}>
          <PriceChart series={seriesProp ?? mockSeries(row.slug, row.current.price)} />
        </div>
      </section>

      {/* ===== Specs ===== */}
      <section className={styles.block} aria-labelledby="specs-title">
        <h2 id="specs-title" className={styles.blockTitle}>
          مشخصات فنی
        </h2>
        <div className={styles.card}>
          <table className={`${styles.specs} tnum`}>
            <caption className="visually-hidden">مشخصات فنی {row.name}</caption>
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
            <span>
              وزن‌ها تئوری‌اند و طبق استاندارد محاسبه شده‌اند؛ وزن واقعی شاخه ممکن است اندکی متفاوت
              باشد.
            </span>
          </p>
        </div>
      </section>

      {/* ===== Bulk / per-factory split ===== */}
      <BulkQuote category={row.categoryId} categoryName={categoryName} rows={categoryRows} subs={categorySubs} logisticsConfig={logisticsConfig} vatRate={vatRate} />

      {/* ===== Related ===== */}
      {related.length > 0 ? (
        <section className={styles.block} aria-labelledby="related-title">
          <h2 id="related-title" className={styles.blockTitle}>
            محصولات مرتبط
          </h2>
          <ul className={styles.related}>
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                  className={styles.relCard}
                >
                  <span className={styles.relName}>{r.name}</span>
                  <span className={styles.relPriceRow}>
                    <span className={`${styles.relPrice} tnum`}>
                      {priceHiddenLabel(r.current) ?? (
                        <>
                          {formatToman(r.current.price, false)}
                          <span className={styles.relUnit}> تومان</span>
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
    </Stack>
  );
}
