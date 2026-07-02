import { Heading, Text, Stack } from '@/components/ui';
import { PricingGrid } from '@/components/admin/pricing/PricingGrid';
import { BilletCard } from '@/components/admin/pricing/BilletCard';

/** /admin/pricing — the daily pricing grid + billet entry. */
export default function AdminPricingPage() {
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>قیمت‌گذاری روزانه</Heading>
        <Text color="muted">
          قیمت هر کالا را ویرایش و یک‌جا ذخیره کنید؛ نوسان و تاریخچه خودکار ثبت می‌شود.
        </Text>
      </div>
      <PricingGrid />
      <BilletCard />
    </Stack>
  );
}
