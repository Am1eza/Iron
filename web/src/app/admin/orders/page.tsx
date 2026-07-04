import { Heading, Text, Stack } from '@/components/ui';
import { OrdersManager } from '@/components/admin/orders/OrdersManager';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/orders — shipment tracking management. */
export default async function AdminOrdersPage() {
  await requirePermission('leads:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>سفارش‌ها</Heading>
        <Text color="muted">
          وضعیت حمل هر سفارش را جلو ببرید؛ مشتری همان لحظه در «پیگیری سفارش» می‌بیند.
        </Text>
      </div>
      <OrdersManager />
    </Stack>
  );
}
