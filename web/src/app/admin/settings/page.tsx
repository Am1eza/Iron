import { Heading, Text, Stack } from '@/components/ui';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';

/** /admin/settings — admin-configurable business rules. */
export default function AdminSettingsPage() {
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
