'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contactSchema, type ContactValues } from '@/lib/validation/schemas';
import { formsApi } from '@/lib/api/forms';
import { TextInput, Textarea } from './fields';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (values: ContactValues) => {
    setError(null);
    try {
      await formsApi.submitContact(values);
      setDone(true);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطایی رخ داد.');
    }
  };

  if (done) return <FormStatus variant="success">پیام شما ثبت شد. ممنون از تماس‌تان.</FormStatus>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}
      <TextInput
        label="نام"
        required
        autoComplete="name"
        error={formState.errors.name?.message}
        {...register('name')}
      />
      <TextInput
        label="شمارهٔ موبایل"
        type="tel"
        inputMode="numeric"
        required
        autoComplete="tel"
        error={formState.errors.mobile?.message}
        {...register('mobile')}
      />
      <Textarea label="پیام شما" required error={formState.errors.message?.message} {...register('message')} />
      <Button type="submit" loading={formState.isSubmitting}>
        ارسال پیام
      </Button>
    </form>
  );
}
