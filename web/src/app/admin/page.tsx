import { Heading, Text, Stack } from '@/components/ui';
import { DashboardTiles } from '@/components/admin/dashboard/DashboardTiles';

/** /admin — the operations dashboard. */
export default function AdminDashboardPage() {
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>داشبورد</Heading>
        <Text color="muted">وضعیت لحظه‌ای قیمت‌ها، سرنخ‌ها و سفارش‌ها.</Text>
      </div>
      <DashboardTiles />
    </Stack>
  );
}
