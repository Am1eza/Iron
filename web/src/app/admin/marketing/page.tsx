import { Heading, Text, Stack } from '@/components/ui';
import { MarketingDashboard } from '@/components/admin/dashboard/MarketingDashboard';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/marketing — campaign + entry-form attribution in toman, lead-cohort
 *  funnel, speed-to-lead, repeat rate, and the dormant-customer call list. */
export default async function AdminMarketingPage() {
  await requirePermission('leads:read', routes.admin.marketing());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>بازاریابی</Heading>
        <Text color="muted">
          چه چیزی فروش می‌آورد — بر حسب تومان، نه فقط تعداد. بازهٔ زمانی را از دکمه‌های زیر عوض کنید؛ همهٔ اعداد صفحه
          با هم تغییر می‌کنند.
        </Text>
      </div>
      <MarketingDashboard />
    </Stack>
  );
}
