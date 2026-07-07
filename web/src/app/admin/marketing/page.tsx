import { Heading, Text, Stack } from '@/components/ui';
import { MarketingDashboard } from '@/components/admin/dashboard/MarketingDashboard';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/marketing — channel attribution, funnel, speed-to-lead, repeat rate. */
export default async function AdminMarketingPage() {
  await requirePermission('leads:read', routes.admin.marketing());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>بازاریابی</Heading>
        <Text color="muted">
          کانال‌های جذب، قیف تبدیل و سرعت پاسخ — همهٔ اعداد از دادهٔ واقعی خود سایت، با بازهٔ مشخص.
        </Text>
      </div>
      <MarketingDashboard />
    </Stack>
  );
}
