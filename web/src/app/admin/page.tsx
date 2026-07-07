import { Heading, Text, Stack } from '@/components/ui';
import { DashboardTiles } from '@/components/admin/dashboard/DashboardTiles';
import { OverviewKpis } from '@/components/admin/dashboard/OverviewKpis';

/** /admin — management KPIs (trend + delta) above the operational tiles. */
export default function AdminDashboardPage() {
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>داشبورد</Heading>
        <Text color="muted">روند ۳۰ روزه و مقایسهٔ هفتگی، به‌همراه وضعیت لحظه‌ای عملیات.</Text>
      </div>
      <OverviewKpis />
      <DashboardTiles />
    </Stack>
  );
}
