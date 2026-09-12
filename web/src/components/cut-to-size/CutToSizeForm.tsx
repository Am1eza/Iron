'use client';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
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

// Submitted verbatim as the request's `product` value, so the array itself
// stays fa-keyed — only the <option> LABEL localizes, via PRODUCT_KEYS below
// mapping each fa value to its `cutToSizeForm.products` key (same
// steel-product vocabulary as WarehouseForm's product list).
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
const PRODUCT_KEYS: Record<string, string> = {
  'ورق سیاه': 'blackSheet',
  'ورق گالوانیزه': 'galvanizedSheet',
  'ورق روغنی': 'oiledSheet',
  'ورق آجدار': 'checkeredSheet',
  تسمه: 'strip',
  میلگرد: 'rebar',
  'نبشی و ناودانی': 'angleAndChannel',
  'پروفیل و قوطی': 'profileAndBoxPipe',
  لوله: 'pipe',
  سایر: 'other',
};

/**
 * «کالا با ابعاد درخواستی» (cut-to-size) intake — profile-centric, identical
 * flow to WarehouseForm: guests sign in first (the request needs a real
 * contact to call back), then submitting files a REAL lead
 * (source='cutToSize') plus a mirrored row in «درخواست‌های من». No online
 * payment — a کارشناس calls to confirm feasibility and price, matching the
 * site's «اول مشورت، بعد خرید» flow.
 */
export function CutToSizeForm() {
  const t = useTranslations('cutToSizeForm');
  const router = useRouter();
  const toast = useToast();
  const status = useAuthStore((s) => s.status);
  const addRequest = useRequestsStore((s) => s.add);
  const [done, setDone] = useState<string | null>(null); // holds the ref once submitted
  const { register, handleSubmit, reset, formState } = useForm<CutToSizeFormValues>({
    defaultValues: { product: '' },
  });

  useEffect(() => {
    if (status === 'anonymous') trackGoal('funnel', 'auth_gate_view', 'cut-to-size');
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <EmptyState
        size="section"
        headline={t('authGateHeadline')}
        body={t('authGateBody')}
        primary={{ label: t('authGateCta'), href: routes.login(routes.cutToSize()) }}
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
        toast.error(err instanceof ApiError ? err.message : t('submitError'));
      }
      return;
    }

    // Mock/demo mode only — no server round trip to fail, so no try/catch.
    const created = addRequest({
      type: 'cutToSize',
      title: `کالا با ابعاد درخواستی: ${values.product}`,
      detail: `ابعاد درخواستی: ${clean.requestedDimensions} · مقدار: ${clean.quantity}`,
      note: clean.notes,
    });
    setDone(created.ref);
    reset();
  };

  if (done) {
    return (
      <FormStatus variant="success">
        {t('successPrefix')}
        <bdi className="tnum">{done}</bdi>
        {t('successSuffix')}{' '}
        <Link
          href={routes.account('requests')}
          onClick={(e) => {
            e.preventDefault();
            router.push(routes.account('requests'));
            router.refresh();
          }}
        >
          {t('trackInProfile')}
        </Link>
      </FormStatus>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      <Field label={t('productLabel')} htmlFor="cts-product" required error={formState.errors.product?.message}>
        <select
          id="cts-product"
          className={fieldStyles.select}
          aria-invalid={formState.errors.product ? true : undefined}
          aria-describedby={formState.errors.product ? 'cts-product-error' : undefined}
          {...register('product', { required: t('productRequired') })}
        >
          <option value="" disabled>
            {t('selectPlaceholder')}
          </option>
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {t(`products.${PRODUCT_KEYS[p]}`)}
            </option>
          ))}
        </select>
      </Field>

      <TextInput
        label={t('currentDimensionsLabel')}
        placeholder={t('currentDimensionsPlaceholder')}
        {...register('currentDimensions')}
      />

      <TextInput
        label={t('requestedDimensionsLabel')}
        placeholder={t('requestedDimensionsPlaceholder')}
        required
        error={formState.errors.requestedDimensions?.message}
        {...register('requestedDimensions', { required: t('requestedDimensionsRequired') })}
      />

      <TextInput
        label={t('quantityLabel')}
        placeholder={t('quantityPlaceholder')}
        required
        error={formState.errors.quantity?.message}
        {...register('quantity', { required: t('quantityRequired') })}
      />

      <Textarea label={t('notesLabel')} {...register('notes')} />

      <Button type="submit" loading={formState.isSubmitting}>
        {t('submitLabel')}
      </Button>
    </form>
  );
}
