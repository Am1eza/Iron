/**
 * Account «انبار من» — the signed-in customer's consigned stock list.
 * `items` arrive pre-resolved from the server page (getWarehouseItems —
 * mock ⇄ live, already carrying the live `unsettledToman` balance per item,
 * W20). Settlement/payment history is new (W20) and has no mock-mode
 * equivalent, so it's fetched client-side, live-mode only.
 */
'use client';
import { useQuery } from '@tanstack/react-query';
import { Stack, Cluster, Text, Badge, EmptyState, Spinner } from '@/components/ui';
import {
  WAREHOUSE_STATUS_LABEL,
  type WarehouseItem,
  type WarehouseStatus,
} from '@/lib/types/domain';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { http } from '@/lib/api/http';
import { API_MODE } from '@/lib/api/config';
import { routes } from '@/lib/routes';

const STATUS_TONE: Record<WarehouseStatus, 'neutral' | 'info' | 'action' | 'gain'> = {
  pending: 'neutral',
  stored: 'info',
  selling: 'action',
  released: 'gain',
};

interface WarehouseSettlementDto {
  id: string;
  warehouseItemId: string;
  periodFrom: string;
  periodTo: string;
  amountToman: number;
  paidAt?: string | null;
  voidedAt?: string | null;
  voidsSettlementId?: string | null;
}

export function WarehouseList({ items }: { items: WarehouseItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        size="section"
        headline="هنوز کالایی در انبار شما ثبت نشده"
        body="برای سپردن کالا به انبار آهن‌تایم (با امکان بیمه)، یک درخواست نگهداری ثبت کنید."
        primary={{ label: 'ثبت درخواست نگهداری', href: routes.warehouse() }}
      />
    );
  }

  return (
    <Stack gap={8}>
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {items.map((it) => (
          <li
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
                  <Cluster gap={2} align="center">
                    <Text variant="label" color="strong" as="span">
                      {it.product}
                      {it.sizeLabel ? ` · ${it.sizeLabel}` : ''}
                    </Text>
                    {it.insured ? <Badge tone="success">بیمه‌شده ✓</Badge> : null}
                  </Cluster>
                  <Text variant="caption" color="muted">
                    کد <bdi>{it.ref}</bdi>
                    {it.contractRef ? (
                      <>
                        {' '}
                        · قرارداد <bdi>{it.contractRef}</bdi>
                      </>
                    ) : null}
                    {' '}· تاریخ ورود: {formatJalali(it.arrivedAt ?? it.storedAt)}
                    {it.location ? ` · محل: ${it.location}` : ''}
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
                    نرخ نگهداری ماهانه (هر تن)
                  </Text>
                  <Text variant="body-sm" color="strong" as="span">
                    <span className="tnum">{formatToman(it.monthlyFeeToman)}</span>
                  </Text>
                </Stack>
                {typeof it.unsettledToman === 'number' ? (
                  <Stack gap={0}>
                    <Text variant="caption" color="muted">
                      مانده تسویه‌نشده
                    </Text>
                    <Text variant="body-sm" color="strong" as="span">
                      <span
                        className="tnum"
                        style={{ color: it.unsettledToman > 0 ? 'var(--color-loss-text)' : undefined }}
                      >
                        {formatToman(it.unsettledToman)}
                      </span>
                    </Text>
                  </Stack>
                ) : null}
              </Cluster>
            </Stack>
          </li>
        ))}
      </ul>

      <SettlementHistory />
    </Stack>
  );
}

/** «تاریخچهٔ تسویه» — the customer's own settlement/payment history
 *  (GET /api/me/warehouse/settlements, W20). Live-only: no backend behind
 *  mock mode for billing history, so it simply stays hidden there rather than
 *  faking financial records. */
function SettlementHistory() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['me', 'warehouse', 'settlements'],
    queryFn: () => http.get<{ settlements: WarehouseSettlementDto[] }>('/api/me/warehouse/settlements'),
    enabled: API_MODE === 'live',
  });

  if (API_MODE !== 'live') return null;

  if (isLoading) {
    return (
      <Stack gap={2}>
        <Text variant="label" color="strong">
          تاریخچهٔ تسویه
        </Text>
        <Cluster gap={2} align="center">
          <Spinner size={16} label="در حال بارگذاری" />
          <Text variant="caption" color="muted">
            در حال بارگذاری تاریخچهٔ تسویه…
          </Text>
        </Cluster>
      </Stack>
    );
  }

  if (isError) {
    return (
      <EmptyState
        size="inline"
        tone="error"
        headline="خطا در دریافت تاریخچهٔ تسویه"
        primary={{ label: 'تلاش دوباره', onClick: () => refetch() }}
      />
    );
  }

  // Hide reversing entries entirely (they only exist to net out a mistake,
  // not to be read as a standalone charge); keep the voided original but
  // mark it superseded — never show a customer a raw ledger where two rows
  // silently cancel out.
  const settlements = (data?.settlements ?? []).filter((s) => !s.voidsSettlementId);
  if (settlements.length === 0) return null;

  return (
    <Stack gap={3}>
      <Text variant="label" color="strong">
        تاریخچهٔ تسویه
      </Text>
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {settlements.map((s) => {
          const voided = Boolean(s.voidedAt);
          return (
            <li
              key={s.id}
              style={{
                border: 'var(--border-hairline) solid var(--color-hairline)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                opacity: voided ? 0.6 : 1,
              }}
            >
              <Cluster justify="space-between" align="center">
                <Stack gap={0}>
                  <Text variant="caption" color="muted">
                    از {formatJalali(s.periodFrom)} تا {formatJalali(s.periodTo)}
                  </Text>
                  <Text variant="body-sm" color="strong" as="span">
                    <span
                      className="tnum"
                      style={voided ? { textDecoration: 'line-through' } : undefined}
                    >
                      {formatToman(s.amountToman)}
                    </span>
                  </Text>
                </Stack>
                <Cluster gap={2}>
                  {voided ? (
                    <Badge tone="neutral">اصلاح شد</Badge>
                  ) : s.paidAt ? (
                    <Badge tone="success">پرداخت‌شده</Badge>
                  ) : (
                    <Badge tone="warning">در انتظار پرداخت</Badge>
                  )}
                </Cluster>
              </Cluster>
            </li>
          );
        })}
      </ul>
    </Stack>
  );
}
