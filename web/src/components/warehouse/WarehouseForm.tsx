'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextInput, Textarea, Field } from '@/components/forms/fields';
import { FormStatus } from '@/components/forms/FormStatus';
import { Button } from '@/components/ui';
import { useToast } from '@/lib/hooks/useToast';
import { normalizeMobile } from '@/lib/utils/format';
import fieldStyles from '@/components/forms/field.module.css';

type WarehouseFormValues = {
  product: string;
  quantityTons: string;
  duration: string;
  name: string;
  mobile: string;
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
 * Request form for the «انبار مشتریان» consignment-storage service.
 * Mock submit only — conceptually creates a lead with source `'warehouse'`.
 */
export function WarehouseForm() {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<WarehouseFormValues>({
    defaultValues: { product: '', duration: '' },
  });

  const onSubmit = async (values: WarehouseFormValues) => {
    setError(null);
    // Mock latency.
    await new Promise((r) => setTimeout(r, 600));
    // Conceptually: api.leads.create({ ...values, source: 'warehouse' })
    void values;
    setDone(true);
    reset();
    toast.success('درخواست نگهداری شما ثبت شد؛ کارشناس به‌زودی تماس می‌گیرد.');
  };

  if (done) {
    return (
      <FormStatus variant="success">
        درخواست نگهداری کالای شما ثبت شد. کارشناس آهن‌تایم برای هماهنگی تحویل و قرارداد با شما تماس
        می‌گیرد.
      </FormStatus>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}

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

      <TextInput
        label="نام"
        required
        error={formState.errors.name?.message}
        {...register('name', { required: 'نام را وارد کنید.' })}
      />

      <TextInput
        label="شمارهٔ موبایل"
        type="tel"
        inputMode="numeric"
        required
        helper="برای هماهنگی تحویل کالا با همین شماره تماس می‌گیریم."
        error={formState.errors.mobile?.message}
        {...register('mobile', {
          required: 'شمارهٔ موبایل را وارد کنید.',
          validate: (v) => normalizeMobile(v) !== null || 'شمارهٔ موبایل معتبر نیست.',
        })}
      />

      <Textarea label="توضیحات" {...register('notes')} />

      <Button type="submit" loading={formState.isSubmitting}>
        ثبت درخواست نگهداری
      </Button>
    </form>
  );
}
