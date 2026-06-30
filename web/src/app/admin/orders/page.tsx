'use client';
import { useState } from 'react';
import { Container, Section, Stack, Cluster, Heading, Text, Card } from '@/components/ui';
import { OrderTimeline } from '@/components/account/OrderTimeline';
import { getOrders } from '@/lib/mock/orders';
import { SHIPMENT_STEPS, type Order, type ShipmentStatus } from '@/lib/types/domain';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';

/**
 * Admin order-tracking — mock view. Set each order's shipment status with the
 * stepper buttons; the timeline updates live (local state, no persistence).
 */
export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>(() => getOrders());

  const setStatus = (ref: string, status: ShipmentStatus) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.ref === ref ? { ...o, status, lastUpdate: new Date().toISOString() } : o,
      ),
    );
  };

  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <Stack gap={1}>
            <Text variant="overline" color="muted">
              پنل › سفارش‌ها
            </Text>
            <Heading level={1}>پیگیری سفارش‌ها</Heading>
            <Text color="muted">
              وضعیت حمل هر سفارش را تعیین کنید؛ مشتری همان وضعیت را در حساب خود می‌بیند.
            </Text>
          </Stack>

          <Stack gap={5}>
            {orders.map((o) => (
              <Card key={o.ref}>
                <Stack gap={4}>
                  <Cluster justify="space-between" align="flex-start">
                    <Stack gap={1}>
                      <Heading level={3}>
                        <bdi>{o.ref}</bdi>
                      </Heading>
                      <Text variant="caption" color="muted">
                        ثبت: {formatJalali(o.placedAt)} · آخرین به‌روزرسانی:{' '}
                        {formatJalali(o.lastUpdate)}
                      </Text>
                    </Stack>
                    <Text variant="caption" color="muted">
                      {toPersianDigits(o.items.length)} ردیف کالا
                    </Text>
                  </Cluster>

                  <OrderTimeline status={o.status} />

                  <Stack gap={2}>
                    <Text variant="label" color="muted">
                      تغییر وضعیت:
                    </Text>
                    <Cluster gap={2}>
                      {SHIPMENT_STEPS.map((step) => {
                        const active = step.key === o.status;
                        return (
                          <button
                            key={step.key}
                            type="button"
                            onClick={() => setStatus(o.ref, step.key)}
                            aria-pressed={active}
                            style={{
                              minBlockSize: 36,
                              paddingInline: 'var(--space-3)',
                              borderRadius: 'var(--radius-pill)',
                              font: 'var(--t-label)',
                              cursor: 'pointer',
                              border: `var(--border-hairline) solid ${
                                active ? 'var(--color-accent)' : 'var(--color-hairline)'
                              }`,
                              background: active
                                ? 'var(--color-accent-tint)'
                                : 'var(--color-surface)',
                              color: active
                                ? 'var(--color-accent-text)'
                                : 'var(--color-text)',
                            }}
                          >
                            {step.label}
                          </button>
                        );
                      })}
                    </Cluster>
                  </Stack>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Stack>
      </Section>
    </Container>
  );
}
