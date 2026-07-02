import { Heading, Text, Stack } from '@/components/ui';
import { OrdersManager } from '@/components/admin/orders/OrdersManager';

/** /admin/orders — shipment tracking management. */
export default function AdminOrdersPage() {
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
