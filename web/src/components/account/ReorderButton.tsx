'use client';
/** One-click reorder (US-07.8) — repopulates the inquiry cart from a past
 *  order's line items and jumps to /cart. No new API: the items are already
 *  in the server-rendered order data, this just replays them into the
 *  client-side cart store. */
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { routes } from '@/lib/routes';
import { Button } from '@/components/ui';
import type { LineItem } from '@/lib/types/domain';

export function ReorderButton({ items }: { items: LineItem[] }) {
  const router = useRouter();
  const add = useCartStore((s) => s.add);
  const toast = useToast();

  // A line whose SKU was later deleted carries skuId:'' (see toLineItem) —
  // there's nothing left to add it back as.
  const reorderable = items.filter((it) => it.skuId);

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={reorderable.length === 0}
      onClick={() => {
        for (const it of reorderable) {
          add({ skuId: it.skuId, name: it.name, qty: it.qty, unit: it.unit, unitPrice: it.unitPrice, weightKg: it.weightKg });
        }
        toast.success(
          reorderable.length < items.length
            ? 'اقلام موجود این سفارش به سبد استعلام اضافه شد (برخی کالاها دیگر موجود نیستند).'
            : 'اقلام این سفارش به سبد استعلام اضافه شد.',
        );
        router.push(routes.cart());
      }}
    >
      سفارش مجدد
    </Button>
  );
}
