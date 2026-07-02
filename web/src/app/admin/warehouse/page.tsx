import { Heading, Text, Stack } from '@/components/ui';
import { WarehouseManager } from '@/components/admin/warehouse/WarehouseManager';

/** /admin/warehouse — the consignment stock (انبار مشتریان). */
export default function AdminWarehousePage() {
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
