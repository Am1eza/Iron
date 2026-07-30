'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { TextInput, Textarea, Field } from '@/components/forms/fields';
import { FormStatus } from '@/components/forms/FormStatus';
import { Button, EmptyState } from '@/components/ui';
import { useToast } from '@/lib/hooks/useToast';
import { useAuthStore } from '@/lib/stores/auth';
import { useRequestsStore } from '@/lib/stores/requests';
import { routes } from '@/lib/routes';
import { api } from '@/lib/api';
import { API_MODE } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { trackGoal } from '@/lib/analytics/track';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
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
 * REAL lead (W20 — this used to be entirely mock: a 400ms fake delay then a
 * localStorage write with no server call at all, so the request reached no
 * one and vanished on a browser clear) and sends the user to
 * /account/requests where its status is tracked.
 */
export function WarehouseForm() {
  const router = useRouter();
  const toast = useToast();
  const status = useAuthStore((s) => s.status);
  const addRequest = useRequestsStore((s) => s.add);
  const [done, setDone] = useState<string | null>(null); // holds the ref once submitted
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
    const quantityTons = Number(normalizeDigits(values.quantityTons));

    if (API_MODE === 'live') {
      try {
        const result = await api.warehouseRequests.submit({
          product: values.product,
          quantityTons,
          duration: values.duration,
          notes: values.notes?.trim() || undefined,
        });
        // Conversion: a visitor became a real warehouse lead in the CRM.
        trackGoal('lead', 'warehouse-request', values.product);
        setDone(result.ref);
        reset();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.');
      }
      return;
    }

    // Mock/demo mode only — no server round trip to fail, so no try/catch.
    const created = addRequest({
      type: 'warehouse',
      title: `نگهداری ${values.product} — ${toPersianDigits(quantityTons)} تن`,
      detail: `مدت نگهداری: ${values.duration}`,
      note: values.notes?.trim() || undefined,
    });
    setDone(created.ref);
    reset();
  };

  if (done) {
    return (
      <FormStatus variant="success">
        درخواست نگهداری کالای شما ثبت شد (کد پیگیری: <bdi className="tnum">{done}</bdi>) و کارشناس برای هماهنگی تحویل
        و قرارداد تماس می‌گیرد.{' '}
        <Link
          href={routes.account('requests')}
          onClick={(e) => {
            // Client-side transition so the /account/requests query, seeded
            // from the server, actually refetches this fresh request instead
            // of showing whatever was cached before submission.
            e.preventDefault();
            router.push(routes.account('requests'));
            router.refresh();
          }}
        >
          پیگیری در پروفایل
        </Link>
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
          // W20: was a hand-rolled Persian-digit-only replace that rejected
          // valid Arabic-Indic input (٠-٩) — normalizeDigits handles both.
          validate: (v) => Number(normalizeDigits(v)) > 0 || 'مقدار باید بزرگ‌تر از صفر باشد.',
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
