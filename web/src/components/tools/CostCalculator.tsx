'use client';
import { useMemo, useState } from 'react';
import { categories } from '@/lib/mock/fixtures';
import { getRows } from '@/lib/mock/catalogData';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { CONSTANTS } from '@/lib/config/constants';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, formatToman } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Switch, DeliveryBadge, MovementBadge } from '@/components/ui';
import { Button } from '@/components/ui';
import { PlusIcon, ChevronDownIcon } from '@/components/primitives/icons';
import styles from './CostCalculator.module.css';

/**
 * محاسبهٔ هزینه — pick دسته → محصول → مقدار (شاخه یا کیلوگرم) and get a live total
 * with optional ارزش افزوده and the delivery time shown. The configured line can be
 * dropped straight into the inquiry cart. All deterministic; numbers tabular.
 */

type Mode = 'branch' | 'kg';

const ACTIVE_CATEGORIES = categories.filter((c) => c.isActive);

function parse(value: string): number {
  const n = Number(normalizeDigits(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function CostCalculator() {
  const add = useCartStore((s) => s.add);
  const toast = useToast();

  const firstCat = ACTIVE_CATEGORIES[0];
  const [catSlug, setCatSlug] = useState<string>(firstCat?.slug ?? '');
  const rows = useMemo(() => getRows(catSlug), [catSlug]);

  const [productId, setProductId] = useState<string>(rows[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('branch');
  const [qtyInput, setQtyInput] = useState('1');
  const [vat, setVat] = useState(false);

  const product = useMemo(
    () => rows.find((r) => r.id === productId) ?? rows[0],
    [rows, productId],
  );

  const onCategoryChange = (slug: string) => {
    setCatSlug(slug);
    const next = getRows(slug)[0];
    setProductId(next?.id ?? '');
  };

  const qty = mode === 'branch' ? Math.max(1, Math.round(parse(qtyInput)) || 1) : parse(qtyInput);
  const weightPerUnit = mode === 'branch' ? product?.theoreticalWeightKg ?? 0 : 1;
  const unitPrice = product?.current.price ?? 0;

  const base = qty * weightPerUnit * unitPrice;
  const vatAmount = vat ? Math.round(base * CONSTANTS.VAT_RATE) : 0;
  const total = Math.round(base) + vatAmount;

  // total weight (kg) only meaningful in شاخه mode
  const totalWeight = mode === 'branch' ? qty * (product?.theoreticalWeightKg ?? 0) : qty;

  const canCompute = Boolean(product) && qty > 0 && unitPrice > 0;

  const addToCart = () => {
    if (!product || !canCompute) return;
    add({
      skuId: product.id,
      name: product.name,
      qty: Math.max(1, Math.round(qty)), // cart qty is an integer (±1 stepper)
      unit: product.unit,
      unitPrice: product.current.price,
      weightKg: mode === 'branch' ? product.theoreticalWeightKg : 1,
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
                {ACTIVE_CATEGORIES.map((c) => (
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
                disabled={rows.length === 0}
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
                aria-label={mode === 'branch' ? 'تعداد شاخه' : 'مقدار به کیلوگرم'}
              />
              <div className={styles.unitToggle} role="group" aria-label="واحد مقدار">
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
            {mode === 'branch' && product?.theoreticalWeightKg ? (
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

      {/* Summary */}
      <Card className={styles.summary}>
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
                  تومان / کیلوگرم
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
                  {mode === 'branch'
                    ? `${toPersianDigits(qty)} شاخه`
                    : `${toPersianDigits(qty)} کیلوگرم`}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>وزن کل</dt>
                <dd className="tnum">{toPersianDigits(Math.round(totalWeight))} کیلوگرم</dd>
              </div>
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
              دسته و محصول را انتخاب کنید و مقدار را وارد کنید تا هزینه محاسبه شود.
            </Text>
          </div>
        )}
      </Card>
    </div>
  );
}
