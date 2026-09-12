'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { http } from '@/lib/api/http';
import type { WarehouseItem } from '@/lib/types/domain';
import { Button } from '@/components/ui';
import { formatToman, normalizeDigits } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/stores/auth';
import { can } from '@/lib/auth/roles';
import ui from '@/components/admin/adminUi.module.css';

type Withdrawal = {
  id: string;
  warehouseItemId: string;
  quantityTons: number;
  recipient: string;
  status: string;
  proof?: string;
};
type Cash = {
  id: string;
  warehouseItemId: string;
  kind: string;
  amountToman: number;
  proof: string;
};
type Outbox = { id: string; message: string; lastError: string; status: string };

// Withdrawal statuses and cash-entry kinds share one lookup below — every
// value either side of the API sends is one of these.
const KNOWN_STATUSES = new Set([
  'requested',
  'approved',
  'delivered',
  'cancelled',
  'sale',
  'payout',
  'payment',
  'refund',
  'reversal',
]);

/**
 * Shared between the admin panel (`staff`, `WarehouseManager.tsx`) and the
 * customer `/account/warehouse` tab (`WarehouseList.tsx`). `useTranslations`
 * (not `getTranslations`) is what lets one component serve both: the admin
 * tree only ever provides the root layout's static fa `NextIntlClientProvider`
 * safety net, so staff always sees fa regardless — unchanged from before —
 * while the customer tab gets the visitor's real locale.
 */
export function WarehouseOperationsPanel({
  items,
  staff = false,
}: {
  items: WarehouseItem[];
  staff?: boolean;
}) {
  const t = useTranslations('warehouseOps');
  const tCommon = useTranslations('common.action');
  const [page, setPage] = useState(1);
  const [stockId, setStockId] = useState('');
  const [qty, setQty] = useState('');
  const [recipient, setRecipient] = useState('');
  const [proof, setProof] = useState('');
  const [amount, setAmount] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const key = useRef('');
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const manager = staff && can(user?.role, 'leads:manage');
  const endpoint = staff ? '/api/admin/operations' : '/api/me/warehouse/operations';

  const query = useQuery({
    queryKey: [staff ? 'admin' : 'me', 'warehouse-operations', page],
    queryFn: () =>
      http.get<{
        withdrawals: Withdrawal[];
        cash: Cash[];
        outbox?: Outbox[];
        hasMore: boolean;
        balance?: { billedFeeBalanceToman: number; salePayableToman: number };
      }>(`${endpoint}?page=${page}`),
  });
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      http.post(endpoint, { ...payload, operationId: (key.current ||= crypto.randomUUID()) }),
    onSuccess: () => {
      key.current = '';
      void query.refetch();
      void qc.invalidateQueries({ queryKey: ['admin', 'warehouse'] });
    },
  });
  const write = (payload: Record<string, unknown>) => mutation.mutate(payload);
  const statusLabel = (status: string) =>
    KNOWN_STATUSES.has(status) ? t(`status.${status}` as Parameters<typeof t>[0]) : status;
  const title = (id: string) => items.find((i) => i.id === id)?.product ?? t('unnamedItem');
  const proofTooShort = proof.trim().length < 5;

  return (
    <section aria-label={t('panelLabel')}>
      <h2>{t('heading')}</h2>
      {query.data?.balance ? (
        <p>
          {t('balance', {
            billed: formatToman(query.data.balance.billedFeeBalanceToman),
            payable: formatToman(query.data.balance.salePayableToman),
          })}
        </p>
      ) : null}

      {!staff ? (
        <fieldset>
          <legend>{t('request.legend')}</legend>
          <label>
            {t('request.itemLabel')}{' '}
            <select
              className={ui.select}
              value={stockId}
              onChange={(e) => setStockId(e.target.value)}
            >
              <option value="">{t('request.itemPlaceholder')}</option>
              {items
                .filter((i) => ['stored', 'selling'].includes(i.status))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.product} — {i.ref}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t('request.qtyLabel')}{' '}
            <input
              className={ui.numInput}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
          <label>
            {t('request.recipientLabel')}{' '}
            <input
              className={ui.textCell}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            disabled={!stockId || !qty || recipient.trim().length < 5 || mutation.isPending}
            onClick={() =>
              write({
                action: 'request',
                warehouseItemId: stockId,
                quantityTons: Number(normalizeDigits(qty)),
                recipient,
              })
            }
          >
            {t('request.submit')}
          </Button>
          <p>{t('request.note')}</p>
        </fieldset>
      ) : null}

      <label>
        {t('proofLabel')}{' '}
        <input
          className={ui.textCell}
          maxLength={1000}
          value={proof}
          onChange={(e) => setProof(e.target.value)}
        />
      </label>

      {query.isPending ? <p role="status">{t('loading')}</p> : null}
      {query.isError ? (
        <p role="alert">
          {t('loadError')} <button onClick={() => void query.refetch()}>{tCommon('retry')}</button>
        </p>
      ) : null}

      <ul>
        {query.data?.withdrawals.map((w) => (
          <li key={w.id}>
            {t('withdrawalRow', {
              title: title(w.warehouseItemId),
              qty: w.quantityTons,
              recipient: w.recipient,
              status: statusLabel(w.status),
            })}
            {staff && w.status === 'requested' ? (
              <Button
                size="sm"
                disabled={proofTooShort || mutation.isPending}
                onClick={() =>
                  write({ action: 'withdrawal', id: w.id, decision: 'approve', proof })
                }
              >
                {t('approveAndReserve')}
              </Button>
            ) : null}
            {staff && w.status === 'approved' ? (
              <Button
                size="sm"
                disabled={proofTooShort || mutation.isPending}
                onClick={() =>
                  write({ action: 'withdrawal', id: w.id, decision: 'deliver', proof })
                }
              >
                {t('recordDelivery')}
              </Button>
            ) : null}
            {['requested', 'approved'].includes(w.status) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={proofTooShort || mutation.isPending}
                onClick={() =>
                  write(
                    staff
                      ? { action: 'withdrawal', id: w.id, decision: 'cancel', proof }
                      : { action: 'cancel', id: w.id, proof },
                  )
                }
              >
                {t('cancelRequest')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {manager ? (
        <fieldset>
          <legend>{t('cashEntry.legend')}</legend>
          <p>{t('cashEntry.note')}</p>
          <label>
            {t('request.itemLabel')}{' '}
            <select
              className={ui.select}
              value={stockId}
              onChange={(e) => setStockId(e.target.value)}
            >
              <option value="">{t('request.itemPlaceholder')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.product} — {i.ref}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('cashEntry.amountLabel')}{' '}
            <input
              className={ui.numInput}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            {t('cashEntry.orderRefLabel')}{' '}
            <input
              className={ui.textCell}
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            disabled={!stockId || !amount || !orderRef || proofTooShort || mutation.isPending}
            onClick={() =>
              write({
                action: 'cash',
                kind: 'sale',
                warehouseItemId: stockId,
                amountToman: Number(normalizeDigits(amount)),
                orderRef,
                proof,
              })
            }
          >
            {t('cashEntry.recordSale')}
          </Button>
          <Button
            size="sm"
            disabled={!stockId || !amount || proofTooShort || mutation.isPending}
            onClick={() =>
              write({
                action: 'cash',
                kind: 'payout',
                warehouseItemId: stockId,
                amountToman: Number(normalizeDigits(amount)),
                proof,
              })
            }
          >
            {t('cashEntry.recordPayout')}
          </Button>
        </fieldset>
      ) : null}

      <h3>{t('cashHeading')}</h3>
      <ul>
        {query.data?.cash.map((c) => (
          <li key={c.id}>
            {t('cashRow', {
              title: title(c.warehouseItemId),
              kind: statusLabel(c.kind),
              amount: formatToman(c.amountToman),
              proof: c.proof,
            })}
            {manager && ['sale', 'payout'].includes(c.kind) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={proofTooShort || mutation.isPending}
                onClick={() =>
                  write({
                    action: 'cash',
                    kind: 'reversal',
                    warehouseItemId: c.warehouseItemId,
                    reversesId: c.id,
                    proof,
                  })
                }
              >
                {t('recordReversal')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {manager && query.data?.outbox?.length ? (
        <>
          <h3>{t('outbox.heading')}</h3>
          <p>{t('outbox.note')}</p>
          <ul>
            {query.data.outbox.map((o) => (
              <li key={o.id}>
                {t('outbox.row', { message: o.message, lastError: o.lastError })}
                <Button
                  size="sm"
                  disabled={proofTooShort || mutation.isPending}
                  onClick={() =>
                    write({ action: 'outbox', id: o.id, decision: 'confirmed_sent', proof })
                  }
                >
                  {t('outbox.confirmSent')}
                </Button>
                <Button
                  size="sm"
                  disabled={proofTooShort || mutation.isPending}
                  onClick={() =>
                    write({ action: 'outbox', id: o.id, decision: 'confirmed_not_sent', proof })
                  }
                >
                  {t('outbox.confirmNotSent')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {mutation.isError ? (
        <p role="alert">
          {mutation.error.message}{' '}
          <button
            onClick={() => {
              key.current = '';
              mutation.reset();
            }}
          >
            {t('retryAfterReview')}
          </button>
        </p>
      ) : null}
      {mutation.isSuccess ? <p role="status">{t('success')}</p> : null}

      <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
        {t('prevPage')}
      </Button>
      <Button size="sm" disabled={!query.data?.hasMore} onClick={() => setPage(page + 1)}>
        {t('nextPage')}
      </Button>
    </section>
  );
}
