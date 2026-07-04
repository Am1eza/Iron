import { Heading, Text, Stack } from '@/components/ui';
import { WarehouseManager } from '@/components/admin/warehouse/WarehouseManager';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/warehouse — the consignment stock (انبار مشتریان). */
export default async function AdminWarehousePage() {
  await requirePermission('leads:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>انبار مشتریان</Heading>
        <Text color="muted">کالاهای امانی مشتریان — تحویل، نگهداری و تسویه.</Text>
      </div>
      <WarehouseManager />
    </Stack>
  );
}
