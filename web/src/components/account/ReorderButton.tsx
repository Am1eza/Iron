'use client';
/** One-click reorder (US-07.8) — repopulates the inquiry cart from a past
 *  order's line items and jumps to /cart. No new API: the items are already
 *  in the server-rendered order data, this just replays them into the
 *  client-side cart store. */
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { inferSnapshotPriceBasis, useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { routes } from '@/lib/routes';
import { Button } from '@/components/ui';
import type { LineItem } from '@/lib/types/domain';

export function ReorderButton({ items }: { items: LineItem[] }) {
  const router = useRouter();
  const add = useCartStore((s) => s.add);
  const toast = useToast();
  const t = useTranslations('account.orders');

  // A line whose SKU was later deleted carries `orderable: false` (E-108;
  // see toLineItem) — there's nothing left to add it back as. This checks
  // the explicit flag rather than re-deriving it from `skuId === ''`, which
  // reads identically for "no id was ever set" and "the id was deleted".
  const reorderable = items.filter((it) => it.orderable ?? Boolean(it.skuId));
  const unorderable = items.filter((it) => !(it.orderable ?? Boolean(it.skuId)));

  return (
    <>
    {reorderable.length === 0 ? <span>کالاهای این سفارش دیگر قابل سفارش نیستند.</span> : null}
    {reorderable.length > 0 && unorderable.length > 0 ? (
      <span>
        این کالاها دیگر قابل سفارش نیستند و در سفارش مجدد گنجانده نمی‌شوند:{' '}
        {unorderable.map((it) => it.name).join('، ')}
      </span>
    ) : null}
    <Button
      size="sm"
      variant="ghost"
      disabled={reorderable.length === 0}
      onClick={() => {
        for (const it of reorderable) {
          add({ skuId: it.skuId, name: it.name, qty: it.qty, unit: it.unit, unitPrice: it.unitPrice, weightKg: it.weightKg, priceBasis: inferSnapshotPriceBasis(it) });
        }
        toast.success(
          reorderable.length < items.length ? t('reorderSuccessPartial') : t('reorderSuccessAll'),
        );
        router.push(routes.cart());
      }}
    >
      {t('reorder')}
    </Button>
    </>
  );
}
