'use client';
/** شمش فولاد — the one admin-entered ticker value. */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { http } from '@/lib/api/http';
import type { MarketValue } from '@/lib/types/domain';
import { normalizeDigits, formatToman, formatJalali } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, Heading, Text, MovementBadge } from '@/components/ui';
import ui from '../adminUi.module.css';

export function BilletCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const [value, setValue] = useState('');

  const { data } = useQuery({
    queryKey: ['admin', 'billet'],
    queryFn: () => http.get<{ values: MarketValue[] }>('/api/market'),
  });
  const billet = data?.values.find((v) => v.key === 'billet');

  const save = useMutation({
    mutationFn: (v: number) => adminApi.saveBillet(v),
    onSuccess: () => {
      toast.success('قیمت شمش ثبت شد.');
      setValue('');
      void qc.invalidateQueries({ queryKey: ['admin', 'billet'] });
      void qc.invalidateQueries({ queryKey: ['market'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت قیمت شمش ناموفق بود.'),
  });

  const submit = () => {
    const n = Number(normalizeDigits(value));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('قیمت معتبر وارد کنید.');
      return;
    }
    save.mutate(Math.round(n));
  };

  return (
    <Card>
      <Heading level={3}>قیمت شمش فولاد</Heading>
      {billet ? (
        <Text color="muted">
          مقدار فعلی: <span className="tnum">{formatToman(billet.value, false)}</span> تومان{' '}
          {billet.movementPct != null ? <MovementBadge dir={billet.movementDir} pct={billet.movementPct} /> : null}{' '}
          <span className={ui.tileHint}>({formatJalali(billet.updatedAt)})</span>
        </Text>
      ) : (
        <Text color="muted">هنوز مقداری ثبت نشده است.</Text>
      )}
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <input
          className={ui.numInput}
          inputMode="numeric"
          placeholder="مثلاً ۲۸۵۰۰۰"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="قیمت شمش (تومان)"
        />
        <Button onClick={submit} loading={save.isPending}>
          ثبت قیمت شمش
        </Button>
      </div>
    </Card>
  );
}
