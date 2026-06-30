/**
 * Account «انبار من» — the signed-in customer's consigned stock list.
 * Presentational; data passed in from the server page.
 */
import { Stack, Cluster, Text, Badge } from '@/components/ui';
import {
  WAREHOUSE_STATUS_LABEL,
  type WarehouseItem,
  type WarehouseStatus,
} from '@/lib/types/domain';
import { formatToman, formatJalali, toPersianDigits } from '@/lib/utils/format';

const STATUS_TONE: Record<WarehouseStatus, 'neutral' | 'info' | 'action' | 'gain'> = {
  pending: 'neutral',
  stored: 'info',
  selling: 'action',
  released: 'gain',
};

export function WarehouseList({ items }: { items: WarehouseItem[] }) {
  return (
    <Stack gap={4}>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            border: 'var(--border-hairline) solid var(--color-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
          }}
        >
          <Stack gap={3}>
            <Cluster justify="space-between" align="flex-start">
              <Stack gap={1}>
                <Text variant="label" color="strong" as="span">
                  {it.product}
                  {it.sizeLabel ? ` · ${it.sizeLabel}` : ''}
                </Text>
                <Text variant="caption" color="muted">
                  کد <bdi>{it.ref}</bdi> · تاریخ ثبت: {formatJalali(it.storedAt)}
                </Text>
              </Stack>
              <Badge tone={STATUS_TONE[it.status]}>{WAREHOUSE_STATUS_LABEL[it.status]}</Badge>
            </Cluster>

            <Cluster gap={6}>
              <Stack gap={0}>
                <Text variant="caption" color="muted">
                  مقدار
                </Text>
                <Text variant="body-sm" color="strong" as="span">
                  <span className="tnum">{toPersianDigits(it.quantityTons)}</span> تن
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text variant="caption" color="muted">
                  هزینهٔ نگهداری ماهانه
                </Text>
                <Text variant="body-sm" color="strong" as="span">
                  <span className="tnum">{formatToman(it.monthlyFeeToman)}</span>
                </Text>
              </Stack>
            </Cluster>
          </Stack>
        </div>
      ))}
    </Stack>
  );
}
