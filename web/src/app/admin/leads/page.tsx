import { Heading, Text, Stack } from '@/components/ui';
import { LeadsBoard } from '@/components/admin/leads/LeadsBoard';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/leads — the CRM: leads, user requests and contact messages. */
export default async function AdminLeadsPage() {
  await requirePermission('leads:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>سرنخ‌ها و درخواست‌ها</Heading>
        <Text color="muted">پیگیری فروش: از درخواست تا پیش‌فاکتور و سفارش.</Text>
      </div>
      <LeadsBoard />
    </Stack>
  );
}
