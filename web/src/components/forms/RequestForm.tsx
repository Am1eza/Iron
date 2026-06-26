'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { requestSchema, type RequestValues } from '@/lib/validation/schemas';
import { formsApi } from '@/lib/api/forms';
import { useCartStore } from '@/lib/stores/cart';
import { toPersianDigits } from '@/lib/utils/format';
import { TextInput, RadioGroup } from './fields';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';

/** ثبت درخواست → پیش‌فاکتور + CRM (UX-flow F6). Items come from the inquiry cart. */
export function RequestForm() {
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const [ref, setRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { channel: 'sms' },
  });

  const onSubmit = async (values: RequestValues) => {
    setError(null);
    try {
      // NOTE: guests pass through the OTP gate (LoginForm) before this in the real flow.
      const res = await formsApi.submitRequest({ ...values, items });
      setRef(res.ref);
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطایی رخ داد.');
    }
  };

  if (ref) {
    return (
      <FormStatus variant="success">
        درخواست شما ثبت شد (شمارهٔ پیش‌فاکتور {ref}). کارشناس تا دقایقی دیگر تماس می‌گیرد.
      </FormStatus>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}
      <p style={{ font: 'var(--t-body-sm)', color: 'var(--color-text-muted)', marginBlockEnd: 'var(--space-3)' }}>
        {items.length > 0
          ? `اقلام انتخاب‌شده: ${toPersianDigits(items.length)} مورد`
          : 'سبد استعلام خالی است؛ ابتدا محصول اضافه کنید.'}
      </p>
      <TextInput label="نام" required error={formState.errors.name?.message} {...register('name')} />
      <TextInput
        label="شمارهٔ موبایل"
        type="tel"
        inputMode="numeric"
        required
        helper="پیش‌فاکتور به همین شماره ارسال می‌شود."
        error={formState.errors.mobile?.message}
        {...register('mobile')}
      />
      <RadioGroup
        label="دریافت پیش‌فاکتور از طریق"
        register={register('channel')}
        options={[
          { value: 'sms', label: 'پیامک' },
          { value: 'whatsapp', label: 'واتساپ' },
        ]}
        error={formState.errors.channel?.message}
      />
      <Button type="submit" loading={formState.isSubmitting} disabled={items.length === 0}>
        ثبت درخواست و دریافت پیش‌فاکتور
      </Button>
    </form>
  );
}
