import { Heading, Text, Stack } from '@/components/ui';
import { MyDesk } from '@/components/admin/desk/MyDesk';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/desk — «میز کار من»: a staff member's own assigned leads, callbacks
 *  and conversion, scoped to them (not the global CRM). */
export default async function MyDeskPage() {
  const user = await requirePermission('leads:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>میز کار من</Heading>
        <Text color="muted">
          سلام{user.name ? `، ${user.name}` : ''} — سرنخ‌ها، تماس‌ها و عملکرد شخصی شما اینجاست.
        </Text>
      </div>
      <MyDesk />
    </Stack>
  );
}
