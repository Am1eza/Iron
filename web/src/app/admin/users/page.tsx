import { Heading, Text, Stack } from '@/components/ui';
import { UsersTable } from '@/components/admin/users/UsersTable';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/users — roles (RBAC) + club tiers. */
export default async function AdminUsersPage() {
  await requirePermission('users:manage', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>کاربران</Heading>
        <Text color="muted">
          نقش هر کاربر دسترسی پنل را تعیین می‌کند؛ تغییر نقش نشست‌های قبلی را باطل می‌کند.
        </Text>
      </div>
      <UsersTable />
    </Stack>
  );
}
