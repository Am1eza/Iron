'use client';
/** شاخص‌های بازار — admin entry/override for every ticker value. شمش has always
 *  been admin-entered; the tgju-backed keys (دلار/یورو/طلا/انس) gain a manual
 *  override for when the feed is unset or stale (the next successful poll
 *  simply writes over it). */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { http } from '@/lib/api/http';
import type { MarketKey, MarketValue } from '@/lib/types/domain';
import { normalizeDigits, formatToman, toPersianDigits, formatJalali } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Card, Heading, Text, MovementBadge } from '@/components/ui';
import ui from '../adminUi.module.css';

const TICKERS: Array<{ key: MarketKey; label: string; unit: string }> = [
  { key: 'billet', label: 'شمش فولاد', unit: 'تومان' },
  { key: 'usd', label: 'دلار', unit: 'تومان' },
  { key: 'eur', label: 'یورو', unit: 'تومان' },
  { key: 'gold18', label: 'طلای ۱۸', unit: 'تومان' },
  { key: 'ounce', label: 'انس جهانی', unit: 'دلار' },
];

export function BilletCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Partial<Record<MarketKey, string>>>({});

  const { data } = useQuery({
    queryKey: ['admin', 'market-tickers'],
    queryFn: () => http.get<{ values: MarketValue[] }>('/api/market'),
  });
  const byKey = new Map((data?.values ?? []).map((v) => [v.key, v]));

  const save = useMutation({
    mutationFn: ({ key, value }: { key: MarketKey; value: number }) =>
      http.put<{ value: MarketValue }>(`/api/admin/market/${key}`, { value }),
    onSuccess: (_res, { key }) => {
      toast.success('مقدار ثبت شد.');
      setDrafts((d) => ({ ...d, [key]: '' }));
      void qc.invalidateQueries({ queryKey: ['admin', 'market-tickers'] });
      void qc.invalidateQueries({ queryKey: ['market'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت مقدار ناموفق بود.'),
  });

  const submit = (key: MarketKey) => {
    const n = Number(normalizeDigits(drafts[key] ?? ''));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('مقدار معتبر وارد کنید.');
      return;
    }
    save.mutate({ key, value: Math.round(n) });
  };

  return (
    <Card>
      <Heading level={3}>شاخص‌های بازار</Heading>
      <Text color="muted">
        شمش همیشه دستی ثبت می‌شود؛ بقیه از فید بازار می‌آیند و این‌جا فقط در صورت قطع/کهنگی فید
        override کنید (بروزرسانی بعدی فید روی آن می‌نویسد).
      </Text>
      <table className={ui.table} style={{ marginBlockStart: 'var(--space-3)' }}>
        <caption className="visually-hidden">مقادیر شاخص‌های بازار و ورود دستی</caption>
        <thead>
          <tr>
            <th scope="col">شاخص</th>
            <th scope="col">مقدار فعلی</th>
            <th scope="col">مقدار جدید</th>
            <th scope="col">ثبت</th>
          </tr>
        </thead>
        <tbody>
          {TICKERS.map((t) => {
            const cur = byKey.get(t.key);
            return (
              <tr key={t.key}>
                <th scope="row">
                  {t.label}
                  {cur?.source === 'admin' && (
                    <>
                      {' '}
                      <Badge tone="info">دستی</Badge>
                    </>
                  )}
                </th>
                <td className="tnum">
                  {cur ? (
                    <>
                      {t.unit === 'تومان' ? formatToman(cur.value, false) : toPersianDigits(cur.value.toLocaleString('en-US'))}{' '}
                      {t.unit}{' '}
                      {cur.movementPct != null ? <MovementBadge dir={cur.movementDir} pct={cur.movementPct} /> : null}
                      <div className={ui.tileHint}>{formatJalali(cur.updatedAt)}</div>
                    </>
                  ) : (
                    <span className={ui.muted}>ثبت نشده</span>
                  )}
                </td>
                <td>
                  <input
                    className={ui.numInput}
                    inputMode="numeric"
                    placeholder={t.key === 'billet' ? 'مثلاً ۲۸۵۰۰۰' : '—'}
                    value={drafts[t.key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
                    aria-label={`مقدار جدید ${t.label} (${t.unit})`}
                  />
                </td>
                <td>
                  <Button
                    size="sm"
                    onClick={() => submit(t.key)}
                    loading={save.isPending && save.variables?.key === t.key}
                    disabled={!(drafts[t.key] ?? '').trim()}
                  >
                    ثبت
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
