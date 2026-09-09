'use client';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Stack, Cluster, Heading, Text, Card, Button } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { FormStatus } from '@/components/forms/FormStatus';
import { OrderTimeline } from '@/components/account/OrderTimeline';
import { shipmentStatusLabel } from '@/lib/utils/shipmentStatusLabel';
import { findOrder } from '@/lib/mock/orders';
import { API_MODE } from '@/lib/api/config';
import type { Order, PriceUnit } from '@/lib/types/domain';
import { localizeDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';

/** Public ref-lookup → renders that order's shipment timeline (mock). */
export function TrackLookup() {
  const t = useTranslations('track');
  const tShipment = useTranslations('account.shipmentStatus');
  const locale = useLocale();
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

  const currentLabel = order ? shipmentStatusLabel(order.status, tShipment) : '';

  return (
    <Stack gap={6}>
      <form onSubmit={lookup} noValidate>
        <Cluster gap={3} align="flex-end">
          <div style={{ flex: '1 1 16rem' }}>
            <TextInput
              label={t('fieldLabel')}
              placeholder={t('fieldPlaceholder')}
              helper={t('fieldHelper')}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          </div>
          <div style={{ marginBlockEnd: 'var(--space-4)' }}>
            <Button type="submit">{t('submit')}</Button>
          </div>
        </Cluster>
      </form>

      {notFound ? <FormStatus variant="error">{t('notFound')}</FormStatus> : null}

      {order ? (
        <Card>
          <Stack gap={4}>
            <Cluster justify="space-between" align="flex-start">
              <Stack gap={1}>
                <Heading level={3}>
                  <bdi>{order.ref}</bdi>
                </Heading>
                <Text variant="caption" color="muted">
                  {t('placedPrefix')} {formatJalali(order.placedAt)} · {t('lastUpdatePrefix')}{' '}
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
                  {it.name}: {localizeDigits(it.qty, locale)} {unitLabel(it.unit, t)}
                </Text>
              ))}
            </Stack>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}

/**
 * Deliberately its own table rather than `PRICE_UNIT_LABEL`: this page renders
 * `kg` as «تن»/"Ton", which no other surface does. Left as found — changing
 * what a shipment card says about quantity is a separate question from
 * adding a translation for it.
 */
function unitLabel(unit: PriceUnit, t: (key: string) => string): string {
  switch (unit) {
    case 'kg':
      return t('unit.kg');
    case 'branch':
      return t('unit.branch');
    case 'sheet':
      return t('unit.sheet');
    case 'meter':
      return t('unit.meter');
    case 'piece':
      return t('unit.piece');
    case 'sqm':
      return t('unit.sqm');
    default:
      return '';
  }
}
