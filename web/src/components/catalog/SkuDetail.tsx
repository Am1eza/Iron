'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, formatJalali } from '@/lib/utils/format';
import { priceSeries, relatedRows, subName } from '@/lib/mock/catalogData';
import { categories } from '@/lib/mock/fixtures';
import type { PriceRow } from '@/lib/types/domain';
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
export function SkuDetail({ row }: { row: PriceRow }) {
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [vat, setVat] = useState(false);
  const [faved, setFaved] = useState(false);

  const cat = categories.find((c) => c.slug === row.categoryId);
  const categoryName = cat?.name ?? row.categoryId;
  const subLabel = subName(row.categoryId, row.subCategoryId);
  const skuUrl = routes.sku(row.categoryId, row.subCategoryId, row.slug);

  const price = vat
    ? Math.round(row.current.price * (1 + CONSTANTS.VAT_RATE))
    : row.current.price;

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

  const toggleFav = () => {
    if (!isAuthenticated) {
      toast.info('برای ذخیرهٔ علاقه‌مندی‌ها وارد شوید.', {
        label: 'ورود',
        href: routes.login(skuUrl),
      });
      return;
    }
    setFaved((v) => !v);
    toast.success(faved ? 'از علاقه‌مندی‌ها حذف شد.' : 'به علاقه‌مندی‌ها اضافه شد.');
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

  const specs: { label: string; value: string }[] = [
    { label: 'سایز', value: row.size ? toPersianDigits(row.size) : '—' },
    {
      label: row.categoryId === 'rebar' ? 'گرید' : 'گرید / استاندارد',
      value: row.grade ?? row.standard ?? '—',
    },
    { label: 'کارخانه', value: row.factory ?? '—' },
    {
      label: 'وزن شاخه',
      value: row.theoreticalWeightKg
        ? `${toPersianDigits(row.theoreticalWeightKg)} کیلوگرم`
        : '—',
    },
    { label: 'واحد فروش', value: 'کیلوگرم' },
    { label: 'زمان تحویل', value: toPersianDigits(row.current.deliveryTime) },
  ];

  const related = relatedRows(row);

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
                  سایز <strong className="tnum">{toPersianDigits(row.size)}</strong>
                </li>
              ) : null}
              {row.grade || row.standard ? <li>گرید {row.grade ?? row.standard}</li> : null}
              {row.factory ? <li>کارخانهٔ {row.factory}</li> : null}
              {row.theoreticalWeightKg ? (
                <li>
                  وزن شاخه{' '}
                  <strong className="tnum">
                    {toPersianDigits(row.theoreticalWeightKg)} kg
                  </strong>
                </li>
              ) : null}
            </ul>
          </div>

          <div className={styles.priceBox}>
            <span className={styles.priceLabel}>قیمت هر کیلوگرم</span>
            <div className={styles.priceRow}>
              <span className={`${styles.priceVal} tnum`}>{formatToman(price, false)}</span>
              <span className={styles.priceUnit}>تومان</span>
            </div>
            <div className={styles.priceMeta}>
              <MovementBadge dir={row.current.movementDir} pct={row.current.movementPct} pill />
              <DeliveryBadge value={row.current.deliveryTime} />
            </div>

            <div className={styles.vatRow}>
              <Switch checked={vat} onChange={setVat} label="با احتساب ارزش افزوده" />
              <span className={styles.vatNote}>
                {vat
                  ? `شامل ${toPersianDigits(CONSTANTS.VAT_RATE * 100)}٪ مالیات بر ارزش افزوده`
                  : 'بدون احتساب ارزش افزوده'}
              </span>
            </div>

            <p className={styles.updated}>
              به‌روزرسانی: {formatJalali(row.current.updatedAt)}
            </p>

            <div className={styles.actions}>
              <Button variant="primary" onClick={addToCart} className={styles.addBtn}>
                <PlusIcon size={18} /> افزودن به سبد استعلام
              </Button>
              <IconButton
                variant="subtle"
                label={faved ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
                active={faved}
                icon={<HeartIcon size={20} filled={faved} />}
                onClick={toggleFav}
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
          <PriceChart series={priceSeries(row.slug, row.current.price)} />
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
                      {formatToman(r.current.price, false)}
                      <span className={styles.relUnit}> تومان</span>
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
