import { Heading, Text, Stack } from '@/components/ui';
import { LeadsBoard } from '@/components/admin/leads/LeadsBoard';

/** /admin/leads — the CRM: leads, user requests and contact messages. */
export default function AdminLeadsPage() {
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
