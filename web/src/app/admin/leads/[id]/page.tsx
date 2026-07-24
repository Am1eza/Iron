import Link from 'next/link';
import { Heading, Stack, Text } from '@/components/ui';
import { LeadDetail } from '@/components/admin/leads/LeadDetail';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/**
 * /admin/leads/[id] — a lead's own page. The list keeps its inline expansion
 * for quick triage, but every deep surface (میز کار, notifications, shared
 * links, the audit log) can now land ON a lead directly instead of forcing
 * the operator to re-find it in the table. Permission-gated by the shared
 * ADMIN_PATH_PERMISSIONS prefix map (leads:read), same as the list.
 */
export default async function AdminLeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('leads:read', routes.admin.dashboard());
  const { id } = await params;
  return (
    <Stack gap={5}>
      <div>
        <Text variant="overline" color="accent">
          <Link href={routes.admin.leads()}>سرنخ‌ها</Link>
        </Text>
        <Heading level={1}>جزئیات سرنخ</Heading>
      </div>
      <LeadDetail id={decodeURIComponent(id)} />
    </Stack>
  );
}
