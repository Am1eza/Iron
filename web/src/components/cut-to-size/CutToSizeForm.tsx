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
import fieldStyles from '@/components/forms/field.module.css';

type CutToSizeFormValues = {
  product: string;
  currentDimensions?: string;
  requestedDimensions: string;
  quantity: string;
  notes?: string;
};

const PRODUCTS = [
  'ورق سیاه',
  'ورق گالوانیزه',
  'ورق روغنی',
  'ورق آجدار',
  'تسمه',
  'میلگرد',
  'نبشی و ناودانی',
  'پروفیل و قوطی',
  'لوله',
  'سایر',
];

/**
 * «کالا با ابعاد درخواستی» (cut-to-size) intake — profile-centric, identical
 * flow to WarehouseForm: guests sign in first (the request needs a real
 * contact to call back), then submitting files a REAL lead
 * (source='cutToSize') plus a mirrored row in «درخواست‌های من». No online
 * payment — a کارشناس calls to confirm feasibility and price, matching the
 * site's «اول مشورت، بعد خرید» flow.
 */
export function CutToSizeForm() {
  const router = useRouter();
  const toast = useToast();
  const status = useAuthStore((s) => s.status);
  const addRequest = useRequestsStore((s) => s.add);
  const [done, setDone] = useState<string | null>(null); // holds the ref once submitted
  const { register, handleSubmit, reset, formState } = useForm<CutToSizeFormValues>({
    defaultValues: { product: '' },
  });

  if (status !== 'authenticated') {
    return (
      <EmptyState
        size="section"
        headline="برای ثبت درخواست وارد شوید"
        body="درخواست برش/تبدیل کالا به ابعاد دلخواه در پروفایل شما ثبت و پیگیری می‌شود؛ ابتدا با شمارهٔ موبایل وارد شوید."
        primary={{ label: 'ورود / ثبت‌نام', href: routes.login(routes.cutToSize()) }}
      />
    );
  }

  const onSubmit = async (values: CutToSizeFormValues) => {
    const clean = {
      product: values.product,
      currentDimensions: values.currentDimensions?.trim() || undefined,
      requestedDimensions: values.requestedDimensions.trim(),
      quantity: values.quantity.trim(),
      notes: values.notes?.trim() || undefined,
    };

    if (API_MODE === 'live') {
      try {
        const result = await api.cutToSizeRequests.submit(clean);
        trackGoal('lead', 'cut-to-size-request', values.product);
        setDone(result.ref);
        reset();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.');
      }
      return;
    }

    // Mock/demo mode only — no server round trip to fail, so no try/catch.
    const created = addRequest({
      type: 'cutToSize',
      title: `کالا با ابعاد درخواستی — ${values.product}`,
      detail: `ابعاد درخواستی: ${clean.requestedDimensions} · مقدار: ${clean.quantity}`,
      note: clean.notes,
    });
    setDone(created.ref);
    reset();
  };

  if (done) {
    return (
      <FormStatus variant="success">
        درخواست شما ثبت شد (کد پیگیری: <bdi className="tnum">{done}</bdi>) و کارشناس برای بررسی امکان برش/تبدیل و اعلام
        هزینه تماس می‌گیرد.{' '}
        <Link
          href={routes.account('requests')}
          onClick={(e) => {
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
      <Field label="نوع کالا" htmlFor="cts-product" required error={formState.errors.product?.message}>
        <select
          id="cts-product"
          className={fieldStyles.select}
          aria-invalid={formState.errors.product ? true : undefined}
          aria-describedby={formState.errors.product ? 'cts-product-error' : undefined}
          {...register('product', { required: 'انتخاب نوع کالا الزامی است.' })}
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
        label="ابعاد فعلی کالا (اختیاری)"
        placeholder="مثلاً ورق ۶ میل، ۱۲۵۰×۲۵۰۰"
        {...register('currentDimensions')}
      />

      <TextInput
        label="ابعاد درخواستی"
        placeholder="مثلاً برش به ۱۰۰۰×۲۰۰۰ یا قطر ۲۰ سانتی‌متر"
        required
        error={formState.errors.requestedDimensions?.message}
        {...register('requestedDimensions', { required: 'ابعاد درخواستی را وارد کنید.' })}
      />

      <TextInput
        label="مقدار"
        placeholder="مثلاً ۵۰ برگ، ۲۰ شاخه یا ۳ تن"
        required
        error={formState.errors.quantity?.message}
        {...register('quantity', { required: 'مقدار را وارد کنید.' })}
      />

      <Textarea label="توضیحات" {...register('notes')} />

      <Button type="submit" loading={formState.isSubmitting}>
        ثبت درخواست
      </Button>
    </form>
  );
}
