'use client';
import type { CatalogImpact } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';

/**
 * The sentences a delete confirm owes the admin, built from SERVER counts.
 *
 * Shared by all three levels because the decision is the same one each time
 * and the copy drifted when it was written out three times: the category
 * dialog quoted sub-categories and products, the sub-category dialog quoted
 * products, and neither said a word about the price history both of them
 * destroy — which is the part that cannot be re-entered from a supplier's
 * price list on Monday morning.
 *
 * Renders only the lines that carry a number worth reading. A product nobody
 * has ever asked about should produce a SHORT dialog: padding every delete
 * with «۰ سرنخ، ۰ سفارش، ۰ هشدار» is how an admin learns to click through the
 * one that says 14.
 */
export function ImpactLines({ impact }: { impact: CatalogImpact | null }) {
  // The lookup failed, or is still in flight. The dialog's own fixed warning
  // still stands; inventing zeroes here would be worse than saying nothing.
  if (!impact) return null;

  const fa = (n: number) => toPersianDigits(n);

  return (
    <>
      {impact.subCategories > 0 || impact.skus > 0 ? (
        <span>
          {impact.subCategories > 0 ? `‏${fa(impact.subCategories)} زیر‌دسته و ` : '‏'}
          {fa(impact.skus)} کالا پاک می‌شوند
          {impact.pricedSkus > 0 ? ` — ${fa(impact.pricedSkus)} تای آن‌ها قیمت منتشرشده دارند` : ''}.
        </span>
      ) : null}

      {impact.pricePoints > 0 ? (
        <span>
          ‏{fa(impact.pricePoints)} ردیف تاریخچهٔ قیمت هم با آن‌ها می‌رود. نموداری که روی این
          تاریخچه ساخته شده دیگر ساخته نمی‌شود و از هیچ جا قابل بازسازی نیست.
        </span>
      ) : null}

      {impact.wonLeads > 0 ? (
        <span>
          ‏{fa(impact.wonLeads)} سرنخ برنده‌شده این کالا را در اقلامش دارد — یعنی روی همین کالا
          فروش انجام شده است.
        </span>
      ) : null}

      {impact.openLeads > 0 ? (
        <span>
          ‏{fa(impact.openLeads)} سرنخ باز این کالا را در اقلام دارد — پیش‌فاکتورهای صادرشده تغییر
          نمی‌کنند.
        </span>
      ) : null}

      {impact.openOrders > 0 ? (
        <span>‏{fa(impact.openOrders)} سفارش در جریان این کالا را دارد.</span>
      ) : null}

      {impact.favorites > 0 || impact.activeAlerts > 0 ? (
        <span>
          ‏{fa(impact.favorites)} کاربر نشانش کرده‌اند و {fa(impact.activeAlerts)} هشدار قیمت رویش
          فعال است.
        </span>
      ) : null}
    </>
  );
}
