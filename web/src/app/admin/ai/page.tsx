import { Heading, Text, Stack } from '@/components/ui';
import { AiAdminTabs } from '@/components/admin/ai/AiAdminTabs';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/ai — review flagged AI-advisor answers + usage console (US-24.3). */
export default async function AdminAiPage() {
  await requirePermission('ai:review', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>دستیار هوشمند</Heading>
        <Text color="muted">
          بازخورد کاربران روی پاسخ‌های دستیار و مصرف روزانهٔ توکن/نقض گاردریل.
        </Text>
      </div>
      <AiAdminTabs />
    </Stack>
  );
}
