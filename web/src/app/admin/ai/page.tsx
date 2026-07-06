import { Heading, Text, Stack } from '@/components/ui';
import { AiReview } from '@/components/admin/ai/AiReview';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/ai — review flagged AI-advisor answers (continuous-improvement loop). */
export default async function AdminAiPage() {
  await requirePermission('ai:review', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>دستیار هوشمند</Heading>
        <Text color="muted">
          بازخورد کاربران روی پاسخ‌های دستیار — پاسخ‌های نامفید را بررسی کنید و گفتگوی کامل را ببینید.
        </Text>
      </div>
      <AiReview />
    </Stack>
  );
}
