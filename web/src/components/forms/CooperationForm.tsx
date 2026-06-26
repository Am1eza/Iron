'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cooperationSchema, type CooperationValues } from '@/lib/validation/schemas';
import { formsApi } from '@/lib/api/forms';
import { TextInput, Textarea } from './fields';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';

type Track = CooperationValues['track'];

export function CooperationForm({ track }: { track: Track }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<CooperationValues>({
    resolver: zodResolver(cooperationSchema),
    defaultValues: { track },
  });

  const onSubmit = async (values: CooperationValues) => {
    setError(null);
    try {
      await formsApi.submitCooperation(values);
      setDone(true);
      reset({ track });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطایی رخ داد.');
    }
  };

  if (done) {
    return <FormStatus variant="success">درخواست همکاری ثبت شد؛ کارشناس ما به‌زودی تماس می‌گیرد.</FormStatus>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}
      <input type="hidden" {...register('track')} />
      <TextInput label="نام شرکت / شخص" required error={formState.errors.company?.message} {...register('company')} />
      <TextInput label="محصول" error={formState.errors.product?.message} {...register('product')} />
      <TextInput
        label="شمارهٔ موبایل"
        type="tel"
        inputMode="numeric"
        required
        error={formState.errors.mobile?.message}
        {...register('mobile')}
      />
      <Textarea label="توضیحات" error={formState.errors.message?.message} {...register('message')} />
      <Button type="submit" loading={formState.isSubmitting}>
        ارسال درخواست همکاری
      </Button>
    </form>
  );
}
