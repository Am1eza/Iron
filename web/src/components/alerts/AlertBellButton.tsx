'use client';
/**
 * Price-alert (قیمت‌سنج) creation trigger — a bell icon that opens a small
 * form modal. This is THE fix for the W22 audit's headline finding: before
 * this component existed, there was no alert-creation control anywhere in
 * the app (only a read-only list at /account/alerts). Dropped onto SKU rows
 * (PriceTable), the SKU hero (SkuDetail) and market cards (MarketBoard) —
 * one component, one behavior, everywhere.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/useAuth';
import { useAlerts } from '@/lib/hooks/useAlerts';
import { useToast } from '@/lib/hooks/useToast';
import { queryKeys } from '@/lib/query/keys';
import { alertsApi } from '@/lib/api/resources/misc';
import { ApiError } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { normalizeDigits, formatToman } from '@/lib/utils/format';
import { findActiveAlert, formatAlertValue, defaultThreshold, capLimitCopy } from '@/lib/utils/alerts';
import type { MarketKey } from '@/lib/types/domain';
import { IconButton, Modal, Button, Tooltip } from '@/components/ui';
import { Field, RadioGroup } from '@/components/forms/fields';
import { BellIcon } from '@/components/primitives/icons';
import fieldStyles from '@/components/forms/field.module.css';
import styles from './AlertBellButton.module.css';

export type AlertBellTarget =
  | { type: 'sku'; skuId: string; label: string; currentValue: number }
  | { type: 'market'; key: MarketKey; label: string; currentValue: number };

type FormValues = { op: 'below' | 'above'; threshold: string };

export function AlertBellButton({
  target,
  size = 'sm',
  variant = 'ghost',
  className,
}: {
  target: AlertBellTarget;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'subtle' | 'solid';
  className?: string;
}) {
  const { isAuthenticated, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useAlerts();
  const alerts = data?.alerts;

  const genericTarget =
    target.type === 'sku'
      ? { type: 'sku' as const, skuId: target.skuId, label: target.label }
      : { type: 'market' as const, key: target.key, label: target.label };
  const activeAlert = findActiveAlert(alerts, genericTarget);

  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState<{ cap: number } | null>(null);

  const { register, handleSubmit, watch, setValue, getValues, reset, formState } = useForm<FormValues>({
    defaultValues: { op: 'below', threshold: String(defaultThreshold(target.currentValue, 'below')) },
  });
  const op = watch('op');

  // Re-suggest the threshold when direction changes — but only while the
  // field still holds the LAST auto-suggested value, so a customer's manual
  // edit is never silently overwritten.
  useEffect(() => {
    const suggested = defaultThreshold(target.currentValue, op);
    const current = getValues('threshold');
    const prevSuggestedBelow = defaultThreshold(target.currentValue, 'below');
    const prevSuggestedAbove = defaultThreshold(target.currentValue, 'above');
    const untouched =
      !current ||
      Number(normalizeDigits(current)) === prevSuggestedBelow ||
      Number(normalizeDigits(current)) === prevSuggestedAbove;
    if (untouched) setValue('threshold', String(suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  const openModal = () => {
    if (!isAuthenticated) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined;
      toast.info('برای ثبت هشدار قیمت وارد شوید.', { label: 'ورود', href: routes.login(next) });
      return;
    }
    setLimit(null);
    // W22 review fix: the bell's label says "مدیریت" (manage) once an alert
    // exists, but this used to always reset to a FRESH 5%-off suggestion —
    // re-opening to just look at an existing alert, then hitting submit
    // without noticing the value had moved, silently created a SECOND
    // active alert on the same target (createAlert only merges on an exact
    // op+threshold match). Pre-filling with the alert's actual stored
    // values means an unchanged re-submit correctly merges instead.
    if (activeAlert) {
      reset({ op: activeAlert.op, threshold: String(activeAlert.threshold) });
    } else {
      reset({ op: 'below', threshold: String(defaultThreshold(target.currentValue, 'below')) });
    }
    setOpen(true);
  };

  const removeExisting = useMutation({
    mutationFn: (id: string) => alertsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.myAlerts() });
      setOpen(false);
      toast.success('هشدار حذف شد.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'حذف هشدار ناموفق بود.'),
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      alertsApi.create({
        target:
          target.type === 'sku' ? { type: 'sku', skuId: target.skuId } : { type: 'market', key: target.key },
        op: values.op,
        threshold: Math.round(Number(normalizeDigits(values.threshold))),
      }),
    onSuccess: ({ alert, merged }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.myAlerts() });
      setOpen(false);
      if (merged) {
        toast.success(`این هشدار از قبل برای شما فعال است: «${target.label}».`, {
          label: 'مشاهده در حساب من',
          href: routes.account('alerts'),
        });
        return;
      }
      const cond =
        alert.op === 'below'
          ? `وقتی «${target.label}» به ${formatToman(alert.threshold, false)} تومان یا کمتر برسد`
          : `وقتی «${target.label}» به ${formatToman(alert.threshold, false)} تومان یا بیشتر برسد`;
      toast.success(`${cond}، پیامک می‌گیرید.`, {
        label: 'مشاهده در حساب من',
        href: routes.account('alerts'),
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'limit') {
        const cap = typeof err.details?.cap === 'number' ? err.details.cap : undefined;
        if (cap != null) {
          setLimit({ cap });
          return;
        }
      }
      if (err instanceof ApiError && err.code === 'target_not_found') {
        setOpen(false);
        toast.error(err.message);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'ثبت هشدار ناموفق بود. دوباره تلاش کنید.');
    },
  });

  const onSubmit = (values: FormValues) => {
    const n = Number(normalizeDigits(values.threshold));
    if (!Number.isFinite(n) || n <= 0) return;
    create.mutate(values);
  };

  const bellLabel = activeAlert ? 'هشدار قیمت فعال؛ مدیریت' : 'ثبت هشدار قیمت';
  // Real bug (Amir, 2026-08-16, screenshotted): the submit button sat inside
  // Modal's plain `.body`, which only has horizontal padding — every OTHER
  // Modal consumer in this codebase (useConfirm, CartView, PriceTable,
  // LeadDetail, LinkDialog, ImageDetailsDialog) puts its action buttons in
  // Modal's `footer` prop instead, which carries the correct block padding.
  // This was the one place that didn't, so the button sat flush against the
  // modal's bottom edge. Computing the limit-cap copy here (not inside a
  // separate LimitNotice component) so its headline/body can live in the
  // Modal body while its buttons live in the footer, same split as the form.
  const limitCopy = limit ? capLimitCopy(limit.cap, user?.clubTier, target.label) : null;

  return (
    <>
      {/* Icon-only trigger — a sighted, non-expert visitor has no text cue for
          what a bell icon does otherwise (design/UX audit). `Tooltip` already
          covers touch via its `onFocusCapture` (a tap focuses the button on
          mobile browsers), so this is the same visible-label pattern the
          audit asked for, not a mouse-only affordance. */}
      <Tooltip content={bellLabel}>
        <IconButton
          size={size}
          variant={variant}
          label={bellLabel}
          active={Boolean(activeAlert)}
          icon={<BellIcon size={size === 'sm' ? 18 : 20} filled={Boolean(activeAlert)} />}
          onClick={openModal}
          className={className}
        />
      </Tooltip>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={activeAlert ? 'مدیریت هشدار قیمت' : 'هشدار قیمت جدید'}
        footer={
          limitCopy ? (
            <div className={styles.actions}>
              {limitCopy.cta ? (
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(limitCopy.cta!.href);
                  }}
                  fullWidth
                >
                  {limitCopy.cta.label}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} fullWidth>
                بستن
              </Button>
            </div>
          ) : (
            <div className={styles.actions}>
              {/* type="button", not "submit": this button now lives in Modal's
                  footer, a DOM sibling of the <form> below (not nested inside
                  it), so native form submission wouldn't reach it — trigger
                  react-hook-form's handler directly instead. Enter-to-submit
                  from inside the form still works via the form's own onSubmit. */}
              <Button type="button" onClick={handleSubmit(onSubmit)} loading={create.isPending} fullWidth>
                {activeAlert ? 'ثبت به‌عنوان هشدار جدید' : 'ثبت هشدار'}
              </Button>
              {activeAlert ? (
                <Button
                  type="button"
                  variant="ghost"
                  loading={removeExisting.isPending}
                  onClick={() => removeExisting.mutate(activeAlert.id)}
                  fullWidth
                >
                  حذف این هشدار
                </Button>
              ) : null}
            </div>
          )
        }
      >
        {limitCopy ? (
          <div className={styles.limit}>
            <p className={styles.limitHeadline}>{limitCopy.headline}</p>
            <p className={styles.limitBody}>{limitCopy.body}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <p className={styles.current}>
              قیمت فعلی «{target.label}»:{' '}
              <bdi className="tnum">{formatAlertValue(target.currentValue, genericTarget)}</bdi>
            </p>
            {activeAlert ? (
              <p className={styles.hint}>
                این هشدار از قبل فعال است. اگر مقدار زیر را تغییر دهید و ثبت کنید، یک هشدار جداگانه اضافه می‌شود؛ برای
                جایگزینی، اول همین هشدار را حذف کنید.
              </p>
            ) : null}

            <RadioGroup
              label="جهت هشدار"
              register={register('op')}
              options={[
                { value: 'below', label: 'وقتی قیمت کمتر شود' },
                { value: 'above', label: 'وقتی قیمت بیشتر شود' },
              ]}
            />

            <Field
              label={`آستانهٔ هشدار (${genericTarget.type === 'sku' ? 'تومان' : 'واحد شاخص'})`}
              htmlFor="alert-threshold"
              required
              error={formState.errors.threshold ? 'مبلغی بزرگ‌تر از صفر وارد کنید.' : undefined}
            >
              <input
                id="alert-threshold"
                className={fieldStyles.input}
                inputMode="decimal"
                aria-invalid={formState.errors.threshold ? true : undefined}
                {...register('threshold', {
                  required: true,
                  validate: (v) => Number(normalizeDigits(v)) > 0,
                })}
              />
            </Field>
            {!activeAlert ? (
              <p className={styles.hint}>
                پیش‌فرض ۵٪ {op === 'below' ? 'کمتر از' : 'بیشتر از'} قیمت فعلی است؛ می‌توانید عددش را تغییر دهید.
              </p>
            ) : null}
          </form>
        )}
      </Modal>
    </>
  );
}
