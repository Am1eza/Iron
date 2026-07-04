import { Heading, Text, Stack } from '@/components/ui';
import { AuditLog } from '@/components/admin/audit/AuditLog';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/audit — the append-only change log. */
export default async function AdminAuditPage() {
  await requirePermission('audit:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>رویدادها</Heading>
        <Text color="muted">هر تغییر ادمین با قبل/بعد ثبت می‌شود؛ این فهرست فقط‌خواندنی است.</Text>
      </div>
      <AuditLog />
    </Stack>
  );
}
