import { Heading, Text, Stack } from '@/components/ui';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/settings — admin-configurable business rules. */
export default async function AdminSettingsPage() {
  await requirePermission('settings:write', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>تنظیمات</Heading>
        <Text color="muted">قوانین کسب‌وکار — ارزش افزوده، اعتبار پیش‌فاکتور، تعطیلات و لجستیک.</Text>
      </div>
      <SettingsForm />
    </Stack>
  );
}
