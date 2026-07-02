'use client';
import { useState } from 'react';
import { Stack, Cluster, Heading, Text, Card, Button } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { FormStatus } from '@/components/forms/FormStatus';
import { OrderTimeline } from '@/components/account/OrderTimeline';
import { findOrder } from '@/lib/mock/orders';
import { API_MODE } from '@/lib/api/config';
import { SHIPMENT_STEPS, type Order } from '@/lib/types/domain';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';

/** Public ref-lookup → renders that order's shipment timeline (mock). */
export function TrackLookup() {
  const [ref, setRef] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (API_MODE === 'live') {
      try {
        const res = await fetch(`/api/track/${encodeURIComponent(ref.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as { order: Order };
          setOrder(data.order);
          setNotFound(false);
        } else {
          setOrder(null);
          setNotFound(true);
        }
      } catch {
        setOrder(null);
        setNotFound(true);
      }
      return;
    }
    const found = findOrder(ref);
    setOrder(found ?? null);
    setNotFound(!found);
  };

  const currentLabel = order
    ? SHIPMENT_STEPS.find((s) => s.key === order.status)?.label ?? ''
    : '';

  return (
    <Stack gap={6}>
      <form onSubmit={lookup} noValidate>
        <Cluster gap={3} align="flex-end">
          <div style={{ flex: '1 1 16rem' }}>
            <TextInput
              label="کد پیگیری سفارش"
              placeholder="مثال: OR-۲۳۰۹"
              helper="کد پیگیری در پیامک تأیید سفارش ارسال شده است."
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          </div>
          <div style={{ marginBlockEnd: 'var(--space-4)' }}>
            <Button type="submit">پیگیری</Button>
          </div>
        </Cluster>
      </form>

      {notFound ? (
        <FormStatus variant="error">
          سفارشی با این کد پیدا نشد. کد پیگیری را بررسی کنید یا با پشتیبانی تماس بگیرید.
        </FormStatus>
      ) : null}

      {order ? (
        <Card>
          <Stack gap={4}>
            <Cluster justify="space-between" align="flex-start">
              <Stack gap={1}>
                <Heading level={3}>
                  <bdi>{order.ref}</bdi>
                </Heading>
                <Text variant="caption" color="muted">
                  ثبت: {formatJalali(order.placedAt)} · آخرین به‌روزرسانی:{' '}
                  {formatJalali(order.lastUpdate)}
                </Text>
              </Stack>
              <Text variant="label" color="accent">
                {currentLabel}
              </Text>
            </Cluster>

            <OrderTimeline status={order.status} />

            <Stack gap={1}>
              {order.items.map((it) => (
                <Text key={it.skuId} variant="body-sm" color="muted">
                  {it.name} — {toPersianDigits(it.qty)} {unitLabel(it.unit)}
                </Text>
              ))}
            </Stack>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}

function unitLabel(unit: string): string {
  switch (unit) {
    case 'kg':
      return 'تن';
    case 'branch':
      return 'شاخه';
    case 'sheet':
      return 'برگ';
    case 'meter':
      return 'متر';
    default:
      return '';
  }
}
