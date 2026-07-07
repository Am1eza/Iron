import { Heading, Text, Stack } from '@/components/ui';
import { SeoDashboard } from '@/components/admin/dashboard/SeoDashboard';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/seo — self-computed content SEO health with actionable fix lists. */
export default async function AdminSeoPage() {
  await requirePermission('content:write', routes.admin.seo());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>سئو</Heading>
        <Text color="muted">
          سلامت سئوی محتوا، محاسبه‌شده روی دادهٔ خود سایت — هر مورد قرمز، یک کار مشخص برای سردبیر است.
        </Text>
      </div>
      <SeoDashboard />
    </Stack>
  );
}
