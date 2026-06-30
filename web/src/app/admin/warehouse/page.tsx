import type { Metadata } from 'next';
import { Container, Section, Stack, Heading, Text, Card, Badge } from '@/components/ui';
import { getWarehouseItems } from '@/lib/mock/warehouse';
import {
  WAREHOUSE_STATUS_LABEL,
  type WarehouseStatus,
} from '@/lib/types/domain';
import { formatToman, formatJalali, toPersianDigits } from '@/lib/utils/format';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STATUS_TONE: Record<WarehouseStatus, 'neutral' | 'info' | 'action' | 'gain'> = {
  pending: 'neutral',
  stored: 'info',
  selling: 'action',
  released: 'gain',
};

const cellStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  borderBlockEnd: 'var(--border-hairline) solid var(--color-hairline)',
  textAlign: 'start',
  font: 'var(--t-body-sm)',
};
const headStyle: React.CSSProperties = {
  ...cellStyle,
  font: 'var(--t-label)',
  color: 'var(--color-text-muted)',
  whiteSpace: 'nowrap',
};

export default function AdminWarehousePage() {
  const items = getWarehouseItems();

  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <Stack gap={1}>
            <Text variant="overline" color="muted">
              پنل › انبار مشتریان
            </Text>
            <Heading level={1}>انبار مشتریان</Heading>
            <Text color="muted">
              فهرست کالاهای امانی مشتریان نزد آهن‌تایم. مجموع {toPersianDigits(items.length)} مورد.
            </Text>
          </Stack>

          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={headStyle}>کد</th>
                    <th style={headStyle}>محصول</th>
                    <th style={headStyle}>مقدار (تن)</th>
                    <th style={headStyle}>هزینهٔ ماهانه</th>
                    <th style={headStyle}>تاریخ ثبت</th>
                    <th style={headStyle}>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td style={{ ...cellStyle, color: 'var(--color-text-muted)' }}>
                        <bdi>{it.ref}</bdi>
                      </td>
                      <td style={{ ...cellStyle, color: 'var(--color-text-strong)' }}>
                        {it.product}
                        {it.sizeLabel ? (
                          <Text variant="caption" color="muted" as="span">
                            {' '}
                            · {it.sizeLabel}
                          </Text>
                        ) : null}
                      </td>
                      <td style={cellStyle} className="tnum">
                        {toPersianDigits(it.quantityTons)}
                      </td>
                      <td style={cellStyle} className="tnum">
                        {formatToman(it.monthlyFeeToman)}
                      </td>
                      <td style={cellStyle} className="tnum">
                        {formatJalali(it.storedAt)}
                      </td>
                      <td style={cellStyle}>
                        <Badge tone={STATUS_TONE[it.status]}>
                          {WAREHOUSE_STATUS_LABEL[it.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Stack>
      </Section>
    </Container>
  );
}
