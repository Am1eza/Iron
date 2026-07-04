'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { TextInput, Textarea, Field } from '@/components/forms/fields';
import { FormStatus } from '@/components/forms/FormStatus';
import { Button, EmptyState } from '@/components/ui';
import { useToast } from '@/lib/hooks/useToast';
import { useAuthStore } from '@/lib/stores/auth';
import { useRequestsStore } from '@/lib/stores/requests';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import fieldStyles from '@/components/forms/field.module.css';

type WarehouseFormValues = {
  product: string;
  quantityTons: string;
  duration: string;
  notes?: string;
};

const PRODUCTS = [
  'میلگرد آجدار',
  'میلگرد ساده',
  'ورق سیاه',
  'ورق گالوانیزه',
  'تیرآهن',
  'نبشی و ناودانی',
  'پروفیل و قوطی',
  'لوله',
  'سایر',
];

const DURATIONS = ['۱ تا ۳ ماه', '۳ تا ۶ ماه', '۶ تا ۱۲ ماه', 'بیش از یک سال'];

/**
 * «انبار مشتریان» request — profile-centric: guests are asked to sign in first
 * (no name/mobile fields; the account already has them). Submitting files a
 * request in /account/requests where its status is tracked.
 */
export function WarehouseForm() {
  const toast = useToast();
  const status = useAuthStore((s) => s.status);
  const addRequest = useRequestsStore((s) => s.add);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, reset, formState } = useForm<WarehouseFormValues>({
    defaultValues: { product: '', duration: '' },
  });

  if (status !== 'authenticated') {
    return (
      <EmptyState
        size="section"
        headline="برای ثبت درخواست وارد شوید"
        body="درخواست نگهداری کالا در پروفایل شما ثبت و پیگیری می‌شود؛ ابتدا با شمارهٔ موبایل وارد شوید."
        primary={{ label: 'ورود / ثبت‌نام', href: routes.login(routes.warehouse()) }}
      />
    );
  }

  const onSubmit = async (values: WarehouseFormValues) => {
    await new Promise((r) => setTimeout(r, 400)); // mock latency
    addRequest({
      type: 'warehouse',
      title: `نگهداری ${values.product} — ${toPersianDigits(values.quantityTons)} تن`,
      detail: `مدت نگهداری: ${values.duration}`,
      note: values.notes?.trim() || undefined,
    });
    setDone(true);
    reset();
    toast.success('درخواست نگهداری ثبت شد؛ وضعیت آن در پروفایل شماست.');
  };

  if (done) {
    return (
      <FormStatus variant="success">
        درخواست نگهداری کالای شما ثبت شد و کارشناس برای هماهنگی تحویل و قرارداد تماس می‌گیرد.{' '}
        <Link href={routes.account('requests')}>پیگیری در پروفایل</Link>
      </FormStatus>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      <Field
        label="نوع محصول"
        htmlFor="wh-product"
        required
        error={formState.errors.product?.message}
      >
        <select
          id="wh-product"
          className={fieldStyles.select}
          aria-invalid={formState.errors.product ? true : undefined}
          aria-describedby={formState.errors.product ? 'wh-product-error' : undefined}
          {...register('product', { required: 'انتخاب نوع محصول الزامی است.' })}
        >
          <option value="" disabled>
            انتخاب کنید…
          </option>
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <TextInput
        label="مقدار (تن)"
        type="text"
        inputMode="decimal"
        required
        error={formState.errors.quantityTons?.message}
        {...register('quantityTons', {
          required: 'مقدار را وارد کنید.',
          validate: (v) =>
            Number(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))) > 0 ||
            'مقدار باید بزرگ‌تر از صفر باشد.',
        })}
      />

      <Field
        label="مدت نگهداری"
        htmlFor="wh-duration"
        required
        error={formState.errors.duration?.message}
      >
        <select
          id="wh-duration"
          className={fieldStyles.select}
          aria-invalid={formState.errors.duration ? true : undefined}
          aria-describedby={formState.errors.duration ? 'wh-duration-error' : undefined}
          {...register('duration', { required: 'مدت نگهداری را انتخاب کنید.' })}
        >
          <option value="" disabled>
            انتخاب کنید…
          </option>
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>

      <Textarea label="توضیحات" {...register('notes')} />

      <Button type="submit" loading={formState.isSubmitting}>
        ثبت درخواست نگهداری
      </Button>
    </form>
  );
}
