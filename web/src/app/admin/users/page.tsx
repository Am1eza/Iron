import { Heading, Text, Stack } from '@/components/ui';
import { UsersTable } from '@/components/admin/users/UsersTable';

/** /admin/users — roles (RBAC) + club tiers. */
export default function AdminUsersPage() {
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
