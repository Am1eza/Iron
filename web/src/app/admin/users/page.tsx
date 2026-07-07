import { Heading, Text, Stack } from '@/components/ui';
import { UsersTable } from '@/components/admin/users/UsersTable';
import { AdminAllowlist } from '@/components/admin/users/AdminAllowlist';
import { VerificationReview } from '@/components/admin/users/VerificationReview';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/users — admin allowlist + roles (RBAC) + club tiers. */
export default async function AdminUsersPage() {
  const session = await requirePermission('users:manage', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>کاربران</Heading>
        <Text color="muted">
          نقش هر کاربر دسترسی پنل را تعیین می‌کند؛ تغییر نقش نشست‌های قبلی را باطل می‌کند.
        </Text>
      </div>
      <AdminAllowlist selfMobile={session.mobile} />
      <VerificationReview />
      <UsersTable />
    </Stack>
  );
}
