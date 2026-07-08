import { Heading, Text, Stack } from '@/components/ui';
import { PricingGrid } from '@/components/admin/pricing/PricingGrid';
import { ExcelImport } from '@/components/admin/pricing/ExcelImport';
import { BilletCard } from '@/components/admin/pricing/BilletCard';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/pricing — the daily pricing grid + billet entry. */
export default async function AdminPricingPage() {
  await requirePermission('pricing:write', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>قیمت‌گذاری روزانه</Heading>
        <Text color="muted">
          قیمت هر کالا را ویرایش و یک‌جا ذخیره کنید؛ نوسان و تاریخچه خودکار ثبت می‌شود.
        </Text>
      </div>
      <ExcelImport />
      <PricingGrid />
      <BilletCard />
    </Stack>
  );
}
