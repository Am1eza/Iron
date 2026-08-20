'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, formatToman } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Switch, DeliveryBadge, MovementBadge } from '@/components/ui';
import { Button } from '@/components/ui';
import { PlusIcon, ChevronDownIcon } from '@/components/primitives/icons';
import styles from './CostCalculator.module.css';
import { priceBasisNoun, priceUnitCaption } from '@/lib/utils/catalogLabels';

/**
 * محاسبهٔ هزینه — pick دسته → محصول → مقدار (شاخه یا کیلوگرم) and get a live total
 * with optional ارزش افزوده and the delivery time shown. The configured line can be
 * dropped straight into the inquiry cart. All deterministic; numbers tabular.
 *
 * audit-2026-08-08/09: used to compute every total off `@/lib/mock/catalogData`'s
 * seeded-PRNG fixture prices, unconditionally — regardless of `API_MODE`, in
 * production, for every visitor, unlike every sibling tool/page which reads
 * real prices. Now fetches the live category list and per-category rows via
 * `api.catalog` (same client, same mock/live split every other client-side
 * catalog read already uses).
 */

type Mode = 'branch' | 'kg';

function parse(value: string): number {
  const n = Number(normalizeDigits(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function CostCalculator() {
  const add = useCartStore((s) => s.add);
  const toast = useToast();

  const { data: categoriesData } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => api.catalog.categories(),
    staleTime: 5 * 60 * 1000,
  });
  const activeCategories = useMemo(
    () => (categoriesData?.categories ?? []).filter((c) => c.isActive),
    [categoriesData],
  );

  const [catSlug, setCatSlug] = useState<string>('');
  // Categories load async — pick the first one the moment the list arrives,
  // same pattern as BulkQuote's `autoPicked` sub-category default.
  useEffect(() => {
    if (!catSlug && activeCategories.length > 0) setCatSlug(activeCategories[0]!.slug);
  }, [catSlug, activeCategories]);

  const { data: rowsData, isLoading: rowsLoading } = useQuery({
    queryKey: ['catalog', 'category-rows', catSlug],
    queryFn: () => api.catalog.category(catSlug),
    enabled: catSlug.length > 0,
    staleTime: 60 * 1000,
  });
  const rows = useMemo(() => rowsData?.rows ?? [], [rowsData]);

  const [productId, setProductId] = useState<string>('');
  // Same as above — rows for the selected category arrive async.
  useEffect(() => {
    if (rows.length > 0 && !rows.some((r) => r.id === productId)) setProductId(rows[0]!.id);
  }, [rows, productId]);

  const [mode, setMode] = useState<Mode>('branch');
  const [qtyInput, setQtyInput] = useState('1');
  const [vat, setVat] = useState(false);

  const product = useMemo(
    () => rows.find((r) => r.id === productId) ?? rows[0],
    [rows, productId],
  );

  const onCategoryChange = (slug: string) => {
    setCatSlug(slug);
    setProductId('');
  };

  /**
   * A product whose price is NOT per kilogram (کوپلر per عدد, لوله مسی per
   * ۱۵-متری کلاف, ورق پانچ per برگ, ساندویچ‌پانل per متر مربع) has no branch
   * weight, so neither of this tool's two modes applies and both would have
   * been wrong: «شاخه» multiplies by `theoreticalWeightKg`, which is null on
   * every one of them, silently producing a total of zero; «کیلوگرم» would
   * have priced the item by mass it does not have. The mode switch is hidden
   * for these and the whole calculation collapses to qty × unitPrice.
   */
  const isWholeItem = (product?.priceBasis ?? 'kg') !== 'kg';
  const effectiveMode: Mode | 'whole' = isWholeItem ? 'whole' : mode;
  // «۲٫۵ متر مربع» of ساندویچ‌پانل is an ordinary order; «۲٫۵ عدد» is a typo.
  const wholeAllowsFraction = product?.unit === 'sqm';

  const qty =
    effectiveMode === 'kg' || (effectiveMode === 'whole' && wholeAllowsFraction)
      ? parse(qtyInput)
      : Math.max(1, Math.round(parse(qtyInput)) || 1);
  const weightPerUnit = effectiveMode === 'branch' ? product?.theoreticalWeightKg ?? 0 : 1;
  const unitPrice = product?.current.price ?? 0;

  const base = qty * weightPerUnit * unitPrice;
  const vatAmount = vat ? Math.round(base * CONSTANTS.VAT_RATE) : 0;
  const total = Math.round(base) + vatAmount;

  // total weight (kg) only meaningful in شاخه mode; null for a piece product,
  // which has no mass on file at all.
  const totalWeight =
    effectiveMode === 'whole'
      ? null
      : effectiveMode === 'branch'
        ? qty * (product?.theoreticalWeightKg ?? 0)
        : qty;

  const canCompute = Boolean(product) && qty > 0 && unitPrice > 0;

  const addToCart = () => {
    if (!product || !canCompute) return;
    add({
      skuId: product.id,
      name: product.name,
      qty: Math.max(1, Math.round(qty)), // cart qty is an integer (±1 stepper)
      unit: product.unit,
      unitPrice: product.current.price,
      weightKg:
        effectiveMode === 'whole'
          ? undefined
          : effectiveMode === 'branch'
            ? product.theoreticalWeightKg
            : 1,
    });
    toast.success(`${product.name} به سبد استعلام اضافه شد.`, {
      label: 'مشاهده سبد',
      href: routes.cart(),
    });
  };

  return (
    <div className={styles.layout}>
      {/* Configurator */}
      <Card className={styles.panel}>
        <Stack gap={5}>
          {/* دسته */}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>دستهٔ کالا</span>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={catSlug}
                onChange={(e) => onCategoryChange(e.target.value)}
                aria-label="انتخاب دستهٔ کالا"
              >
                {activeCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={18} className={styles.selectChevron} />
            </div>
          </label>

          {/* محصول */}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>محصول</span>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                aria-label="انتخاب محصول"
                disabled={rows.length === 0 || rowsLoading}
              >
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={18} className={styles.selectChevron} />
            </div>
          </label>

          {/* مقدار + واحد */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>مقدار</span>
            <div className={styles.qtyRow}>
              <input
                className={`${styles.input} tnum`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="مقدار"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                aria-label={
                  effectiveMode === 'whole'
                    ? `مقدار به ${priceBasisNoun(product?.priceBasis, product?.branchLengthM)}`
                    : effectiveMode === 'branch'
                      ? 'تعداد شاخه'
                      : 'مقدار به کیلوگرم'
                }
              />
              {/* No شاخه/کیلوگرم choice for a piece product — «عدد» is the only
                  unit it is sold in, so the toggle would offer two wrong answers. */}
              <div
                className={styles.unitToggle}
                role="group"
                aria-label="واحد مقدار"
                hidden={effectiveMode === 'whole'}
              >
                <button
                  type="button"
                  className={styles.unitBtn}
                  data-active={mode === 'branch' ? '' : undefined}
                  aria-pressed={mode === 'branch'}
                  onClick={() => setMode('branch')}
                >
                  شاخه
                </button>
                <button
                  type="button"
                  className={styles.unitBtn}
                  data-active={mode === 'kg' ? '' : undefined}
                  aria-pressed={mode === 'kg'}
                  onClick={() => setMode('kg')}
                >
                  کیلوگرم
                </button>
              </div>
            </div>
            {effectiveMode === 'branch' && product?.theoreticalWeightKg ? (
              <Text variant="caption" color="muted">
                وزن هر شاخه ≈{' '}
                <span className="tnum">{toPersianDigits(product.theoreticalWeightKg)}</span>{' '}
                کیلوگرم
              </Text>
            ) : null}
          </div>

          <Switch
            checked={vat}
            onChange={setVat}
            label={`احتساب ارزش افزوده (${toPersianDigits(CONSTANTS.VAT_RATE * 100)}٪)`}
          />
        </Stack>
      </Card>

      {/* Summary — announced politely so keyboard/AT users hear the computed
          total without having to re-read the whole panel (accessibility.md §4.3). */}
      <Card className={styles.summary} role="status" aria-live="polite" aria-atomic="true">
        {product && canCompute ? (
          <Stack gap={5}>
            <div>
              <Text variant="overline" color="muted" as="p">
                {product.name}
              </Text>
              <Cluster gap={3} align="center">
                <span className={`${styles.unitPrice} tnum`}>
                  {formatToman(unitPrice, false)}
                </span>
                <Text variant="caption" color="muted">
                  {priceUnitCaption(product.priceBasis, product.branchLengthM)}
                </Text>
                <MovementBadge
                  dir={product.current.movementDir}
                  pct={product.current.movementPct}
                  pill
                />
              </Cluster>
            </div>

            <div className={styles.divider} aria-hidden="true" />

            <dl className={styles.breakdown}>
              <div className={styles.row}>
                <dt>مقدار</dt>
                <dd className="tnum">
                  {effectiveMode === 'whole'
                    ? `${toPersianDigits(qty)} ${priceBasisNoun(product.priceBasis, product.branchLengthM)}`
                    : effectiveMode === 'branch'
                      ? `${toPersianDigits(qty)} شاخه`
                      : `${toPersianDigits(qty)} کیلوگرم`}
                </dd>
              </div>
              {totalWeight != null ? (
                <div className={styles.row}>
                  <dt>وزن کل</dt>
                  <dd className="tnum">{toPersianDigits(Math.round(totalWeight))} کیلوگرم</dd>
                </div>
              ) : null}
              <div className={styles.row}>
                <dt>مبلغ کالا</dt>
                <dd className="tnum">{formatToman(base)}</dd>
              </div>
              {vat ? (
                <div className={styles.row}>
                  <dt>{`ارزش افزوده (${toPersianDigits(CONSTANTS.VAT_RATE * 100)}٪)`}</dt>
                  <dd className="tnum">{formatToman(vatAmount)}</dd>
                </div>
              ) : null}
            </dl>

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>جمع کل</span>
              <span className={`${styles.totalValue} tnum`}>{formatToman(total)}</span>
            </div>

            <Cluster gap={2} align="center" justify="space-between">
              <Text variant="caption" color="muted">
                زمان تحویل
              </Text>
              <DeliveryBadge value={product.current.deliveryTime} />
            </Cluster>

            <Button variant="primary" size="md" fullWidth onClick={addToCart}>
              <PlusIcon size={18} /> افزودن به سبد استعلام
            </Button>

            <Text variant="caption" color="muted" align="center">
              قیمت نهایی هنگام صدور پیش‌فاکتور تأیید می‌شود. اول مشورت، بعد خرید.
            </Text>
          </Stack>
        ) : (
          <div className={styles.placeholder}>
            <Text variant="body-sm" color="muted" align="center">
              {rowsLoading
                ? 'در حال دریافت قیمت‌های لحظه‌ای…'
                : 'دسته و محصول را انتخاب کنید و مقدار را وارد کنید تا هزینه محاسبه شود.'}
            </Text>
          </div>
        )}
      </Card>
    </div>
  );
}
