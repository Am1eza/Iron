import { Heading, Text, Stack } from '@/components/ui';
import { ContentQueue } from '@/components/admin/content/ContentQueue';

/** /admin/content — the article approval/scheduling queue. */
export default function AdminContentPage() {
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>محتوا</Heading>
        <Text color="muted">پیش‌نویس‌های هوش مصنوعی پس از بازبینی سردبیر منتشر می‌شوند.</Text>
      </div>
      <ContentQueue />
    </Stack>
  );
}
