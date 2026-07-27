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
        <Heading level={1}>گزارش فعالیت</Heading>
        <Text color="muted">
          هر تغییری که در پنل انجام می‌شود — همراه با اینکه چه کسی، چه زمانی و دقیقاً کدام مقدار را از چه به چه
          تغییر داده. این گزارش فقط‌خواندنی است و پاک نمی‌شود.
        </Text>
      </div>
      <AuditLog />
    </Stack>
  );
}
