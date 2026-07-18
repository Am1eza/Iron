import { Heading, Text, Stack } from '@/components/ui';
import { AlertsPanel } from '@/components/admin/alerts/AlertsPanel';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/alerts — every user's price alerts (قیمت‌سنج), US-24.5. */
export default async function AdminAlertsPage() {
  await requirePermission('pricing:write', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>هشدارهای قیمت</Heading>
        <Text color="muted">هشدارهای فعال/متوقف کاربران را ببینید و در صورت نیاز متوقف کنید.</Text>
      </div>
      <AlertsPanel />
    </Stack>
  );
}
