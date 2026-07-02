'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { alertSchema, type AlertValues } from '@/lib/validation/schemas';
import { formsApi } from '@/lib/api/forms';
import { TextInput, RadioGroup } from './fields';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';

export type AlertTarget =
  | { type: 'sku'; skuId: string }
  | { type: 'market'; key: 'usd' | 'eur' | 'gold18' | 'ounce' | 'billet' };

/** قیمت‌سنج — set a price alert. Mounted in a modal from a row/ticker item. */
export function AlertForm({
  targetLabel,
  target,
  onDone,
}: {
  targetLabel: string;
  /** Structured target for the live API; label-only submissions stay mock-friendly. */
  target?: AlertTarget;
  onDone?: () => void;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<AlertValues>({
    resolver: zodResolver(alertSchema),
    defaultValues: { op: 'below', channel: 'sms' },
  });

  const onSubmit = async (values: AlertValues) => {
    setError(null);
    try {
      await formsApi.createAlert({ ...values, target: target ?? targetLabel, targetLabel });
      setDone(true);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطایی رخ داد.');
    }
  };

  if (done) return <FormStatus variant="success">هشدار ثبت شد؛ هنگام رسیدن به این قیمت خبرتان می‌کنیم.</FormStatus>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 360 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}
      <p style={{ font: 'var(--t-body-sm)', color: 'var(--color-text-muted)', marginBlockEnd: 'var(--space-3)' }}>
        هشدار برای: {targetLabel}
      </p>
      <RadioGroup
        label="شرط"
        register={register('op')}
        options={[
          { value: 'below', label: 'زیر' },
          { value: 'above', label: 'بالای' },
        ]}
        error={formState.errors.op?.message}
      />
      <TextInput
        label="قیمت هدف (تومان)"
        inputMode="numeric"
        required
        error={formState.errors.threshold?.message}
        {...register('threshold')}
      />
      <RadioGroup
        label="کانال اطلاع‌رسانی"
        register={register('channel')}
        options={[
          { value: 'sms', label: 'پیامک' },
          { value: 'telegram', label: 'تلگرام' },
        ]}
        error={formState.errors.channel?.message}
      />
      <Button type="submit" loading={formState.isSubmitting}>
        ذخیرهٔ هشدار
      </Button>
    </form>
  );
}
