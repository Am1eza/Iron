'use client';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  useCartStore,
  selectCartCount,
  selectCartTotalWeight,
  selectCartEstTotal,
  cartItemEstimateToman,
} from '@/lib/stores/cart';
import type { CartItem } from '@/lib/stores/cart';
import { routes } from '@/lib/routes';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
import {
  EmptyState,
  emptyPresets,
  IconButton,
  Skeleton,
  Alert,
  Modal,
  Button,
} from '@/components/ui';
import {
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ArrowEndIcon,
} from '@/components/primitives/icons';
import styles from './CartView.module.css';
import { PRICE_UNIT_LABEL } from '@/lib/utils/catalogLabels';
import {
  resolveVolumeTier,
  tierPercentLabel,
  volumeDiscountToman,
  VOLUME_TIERS,
  type VolumeTier,
} from '@/lib/config/pricingTiers';
import { DEFAULT_ORDER_POLICY } from '@/lib/config/orderPolicy';

/** کیلوگرم/شاخه/برگ/متر — display labels for the price unit. */

/** Per-line estimate = unitPrice (per kg) × the item's real weight (mirrors selectCartEstTotal). */
function lineEstimate(item: CartItem): number {
  return cartItemEstimateToman(item);
}

/**
 * Inquiry cart (سبد استعلام). The cart store uses skipHydration, so we render a
 * stable placeholder until mounted to avoid an SSR/client mismatch, then show the
 * line items with a qty stepper, a sticky summary, and the «ادامه و ثبت درخواست» CTA.
 * No online payment — a کارشناس confirms the final price and delivery.
 */
export function CartView({
  minimumAutoQuoteToman = DEFAULT_ORDER_POLICY.minimumAutoQuoteToman,
  volumeTiers = VOLUME_TIERS,
}: {
  minimumAutoQuoteToman?: number;
  volumeTiers?: readonly VolumeTier[];
}) {
  const t = useTranslations('cart');
  const tAction = useTranslations('common.action');
  const tUnit = useTranslations('common.unit');
  const tEmpty = useTranslations('emptyPresets');
  const locale = useLocale() as AppLocale;
  const [mounted, setMounted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isAuthenticated } = useAuth();

  const items = useCartStore((s) => s.items);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);

  const count = useCartStore(selectCartCount);
  const totalWeight = useCartStore(selectCartTotalWeight);
  const estTotal = useCartStore(selectCartEstTotal);
  const resolvedTier = resolveVolumeTier({ totalWeightKg: totalWeight }, volumeTiers);
  const tierDiscount = volumeDiscountToman(estTotal, resolvedTier.tier);
  const nextTier = [...volumeTiers].sort((a, b) => a.minWeightKg - b.minWeightKg).find((tier) => tier.minWeightKg > totalWeight);
  const money = (v: number) => `${formatToman(v, false, locale)} ${tUnit('currency')}`;

  // Pre-hydration placeholder — calm skeleton so the layout never flashes empty.
  if (!mounted) {
    return (
      <div className={styles.skeleton} aria-hidden="true">
        <div className={styles.skeletonList}>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
        <Skeleton height={260} />
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState size="section" {...emptyPresets.cartEmpty(tEmpty)} />;
  }

  return (
    <div className={styles.layout}>
      {/* Line items */}
      <section className={styles.items} aria-labelledby="cart-items-title">
        <h2 id="cart-items-title" className="visually-hidden">
          {t('itemsHeading')}
        </h2>
        <ul className={styles.list}>
          {items.map((item) => {
            const est = lineEstimate(item);
            const unit = PRICE_UNIT_LABEL[item.unit];
            return (
              <li key={item.skuId} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowName}>{item.name}</p>
                  <p className={styles.rowMeta}>
                    {t('unitLabel', { unit })}
                    {item.unit !== 'kg' && item.weightKg ? (
                      <>
                        {' · '}
                        {t('weightPerUnit', { weight: localizeDigits(item.weightKg, locale) })}
                      </>
                    ) : null}
                  </p>
                </div>

                <div className={styles.stepper} role="group" aria-label={t('qtyAria', { name: item.name })}>
                  <IconButton
                    size="sm"
                    label={t('decreaseQty', { name: item.name })}
                    icon={<MinusIcon size={16} />}
                    disabled={item.qty <= 1}
                    onClick={() => setQty(item.skuId, item.qty - 1)}
                  />
                  <span className={`${styles.qty} tnum`} aria-live="polite">
                    {localizeDigits(item.qty, locale)}
                  </span>
                  <IconButton
                    size="sm"
                    label={t('increaseQty', { name: item.name })}
                    icon={<PlusIcon size={16} />}
                    onClick={() => setQty(item.skuId, item.qty + 1)}
                  />
                </div>

                <div className={styles.rowEst}>
                  <span className={styles.rowEstLabel}>{t('estimateLabel')}</span>
                  <span className={`${styles.rowEstValue} tnum`}>
                    {item.unitPrice ? money(est) : t('quoteOnRequest')}
                  </span>
                </div>

                <IconButton
                  size="sm"
                  variant="ghost"
                  className={styles.remove}
                  label={t('removeItem', { name: item.name })}
                  icon={<TrashIcon size={18} />}
                  onClick={() => remove(item.skuId)}
                />
              </li>
            );
          })}
        </ul>

        <div className={styles.itemsFoot}>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setConfirmClear(true)}
          >
            <TrashIcon size={16} />
            {t('clearCart')}
          </button>
          <Modal
            open={confirmClear}
            onClose={() => setConfirmClear(false)}
            title={t('clearCartTitle')}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                  {tAction('cancel')}
                </Button>
                <Button
                  onClick={() => {
                    clear();
                    setConfirmClear(false);
                  }}
                >
                  {t('clearConfirm')}
                </Button>
              </>
            }
          >
            <p style={{ margin: 0 }}>{t('clearCartBody')}</p>
          </Modal>
          <Link href={routes.prices()} className={styles.continueShopping}>
            {t('addMoreItems')}
          </Link>
        </div>
      </section>

      {/* Summary */}
      <aside className={styles.summary} aria-labelledby="cart-summary-title">
        <div className={styles.summaryCard}>
          <h2 id="cart-summary-title" className={styles.summaryTitle}>
            {t('summaryTitle')}
          </h2>

          <dl className={styles.summaryList}>
            <div className={styles.summaryRow}>
              <dt>{t('itemCount')}</dt>
              <dd className="tnum">{t('itemCountValue', { count: localizeDigits(count, locale) })}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('totalWeight')}</dt>
              <dd className="tnum">
                {totalWeight > 0
                  ? t('totalWeightValue', { weight: localizeDigits(Math.round(totalWeight), locale) })
                  : t('totalWeightUnknown')}
              </dd>
            </div>
            <div className={`${styles.summaryRow} ${styles.summaryTotalRow}`}>
              <dt>{t('estimatedTotal')}</dt>
              <dd className={`${styles.summaryTotal} tnum`}>
                {estTotal > 0 ? money(estTotal) : t('quoteOnRequest')}
              </dd>
            </div>
          </dl>

          <Alert tone={tierDiscount > 0 ? 'success' : 'info'} className={styles.calmNote}>
            {tierDiscount > 0 ? (
              t('tierDiscountNote', {
                tier: resolvedTier.tier.label,
                percent: localizeDigits(tierPercentLabel(resolvedTier.tier), locale),
                amount: money(tierDiscount),
              })
            ) : (
              t('baseTierNote')
            )}
            {nextTier
              ? t('nextTierNote', {
                  weight: localizeDigits(Math.ceil(nextTier.minWeightKg - totalWeight), locale),
                  tier: nextTier.label,
                  percent: localizeDigits(tierPercentLabel(nextTier), locale),
                })
              : null}
          </Alert>

          <p className={styles.estNote}>{t('estimateDisclaimer')}</p>

          {estTotal > 0 && estTotal < minimumAutoQuoteToman ? (
            <Alert tone="warning" className={styles.calmNote}>
              {t('belowAutoQuoteNote', { amount: money(minimumAutoQuoteToman) })}
            </Alert>
          ) : null}

          <Link href={routes.request()} className={styles.primaryCta} data-event="cart_to_request">
            {/* /request is auth-gated (requireUser) and silently bounces a
                guest to /login?next=/request with no warning — the audited
                bug. Say the login step out loud here instead of letting the
                visitor discover it mid-redirect. */}
            {isAuthenticated ? t('continueRequestCta') : t('loginContinueRequestCta')}
            <ArrowEndIcon size={18} />
          </Link>

          <Alert tone="info" className={styles.calmNote}>
            {t('noOnlinePaymentNote')}
          </Alert>
        </div>
      </aside>
    </div>
  );
}
