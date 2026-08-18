'use client';
/**
 * «ترتیب کارخانه‌ها» — the admin's control over which mills lead a category's
 * price page (US-18.2).
 *
 * The public page used to sort its «بر اساس کارخانه» sections by cheapest
 * visible price, which reshuffled the page daily and buried the mills
 * customers actually ask for by name under ones they have never heard of.
 * That order is now the FALLBACK; this panel is the opinion that overrides it.
 *
 * Two zones rather than one list, deliberately. The data model allows a
 * PARTIAL order — some factories placed, the rest still price-sorted — and a
 * single flat list could not express that: nudging one mill to the top would
 * silently freeze the other seventeen in whatever order they happened to be
 * rendered in, which is a change the admin never asked for and cannot see.
 * So «چیده‌شده» is the arranged block (reorderable, removable) and «بقیه» is
 * everything still following the price sort, each with one action to move it
 * into the arranged block.
 *
 * Reordering mirrors TaxonomyRail exactly — the same two chevron IconButtons,
 * disabled at the ends, disabled while a write is in flight — because this is
 * the same gesture on the same screen and the admin has already learnt it.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AdminFactoryOrderRow } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, Button, IconButton } from '@/components/ui';
import { ChevronDownIcon, CloseIcon, PlusIcon } from '@/components/primitives/icons';
import ui from '../adminUi.module.css';
import s from './catalog.module.css';

export function FactoryOrderPanel({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Under the ['admin','cat'] prefix so CatalogManager's invalidateAll()
  // already refreshes it after any catalog write — a factory that stops
  // existing because its last product was retired must not linger here.
  const q = useQuery({
    queryKey: ['admin', 'cat', 'factoryOrder', categoryId],
    queryFn: () => adminApi.factoryOrder(categoryId),
    enabled: Boolean(categoryId) && open,
  });

  const rows: AdminFactoryOrderRow[] = q.data?.factories ?? [];
  const placed = rows.filter((r) => r.order !== null);
  const rest = rows.filter((r) => r.order === null);

  const save = useMutation({
    mutationFn: (factories: string[]) => adminApi.setFactoryOrder(categoryId, factories),
    onSuccess: () => {
      toast.success('ترتیب کارخانه‌ها ذخیره شد.');
      // The public price page is ISR'd (revalidate = 300) and the write route
      // already purged it; this only refreshes the panel itself.
      void qc.invalidateQueries({ queryKey: ['admin', 'cat', 'factoryOrder', categoryId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیرهٔ ترتیب ناموفق بود.'),
  });

  /** Send the arranged block as it should be AFTER this click. Always the
   *  whole list — the endpoint replaces, it does not merge. */
  const apply = (next: string[]) => save.mutate(next);

  const move = (factory: string, dir: -1 | 1) => {
    const names = placed.map((r) => r.factory);
    const i = names.indexOf(factory);
    const target = i + dir;
    // No hidden rows in this list (unlike the rail), so a plain neighbour
    // swap is the right move — the guard is only for the ends.
    if (i < 0 || target < 0 || target >= names.length) return;
    const next = [...names];
    [next[i], next[target]] = [next[target]!, next[i]!];
    apply(next);
  };

  const busy = save.isPending || q.isFetching;

  return (
    <section className={ui.panel} aria-labelledby={`factory-order-${categoryId}`}>
      <div className={s.factoryHead}>
        <span className={s.factoryTitle} id={`factory-order-${categoryId}`}>
          ترتیب کارخانه‌ها در صفحهٔ قیمت «{categoryName}»
        </span>
        {open && placed.length > 0 ? (
          <Badge tone="info">{toPersianDigits(placed.length)} کارخانه چیده‌شده</Badge>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          style={{ marginInlineStart: 'auto' }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'بستن' : 'چیدن ترتیب'}
        </Button>
      </div>

      {open ? (
        <div className={s.factoryBody}>
          <p className={ui.muted}>
            بخش‌های «بر اساس کارخانه» در صفحهٔ قیمت به همین ترتیب نمایش داده می‌شوند. هر کارخانه‌ای که نچینید،
            پس از فهرست بالا و بر اساس ارزان‌ترین قیمت می‌آید — مثل قبل.
          </p>

          {q.isLoading ? (
            <p className={ui.muted}>در حال بارگذاری…</p>
          ) : q.isError ? (
            <p className={ui.muted}>
              بارگذاری فهرست کارخانه‌ها ناموفق بود.{' '}
              <button type="button" className={ui.linkButton} onClick={() => void q.refetch()}>
                تلاش دوباره
              </button>
            </p>
          ) : rows.length === 0 ? (
            <p className={ui.muted}>هیچ کالای فعالی در این دسته کارخانه‌ای ثبت‌شده ندارد.</p>
          ) : (
            <>
              <div className={s.factoryGroupHeader}>چیده‌شده — به همین ترتیب در سایت</div>
              {placed.length === 0 ? (
                <p className={ui.muted}>
                  هنوز ترتیبی نچیده‌اید؛ صفحهٔ قیمت فعلاً کارخانه‌ها را بر اساس ارزان‌ترین قیمت می‌چیند. از فهرست
                  پایین، کارخانه‌های مهم را اضافه کنید.
                </p>
              ) : (
                placed.map((r, i) => (
                  <div key={r.factory} className={`${s.node} ${s.factoryRow}`}>
                    <span className={s.factoryRank}>{toPersianDigits(i + 1)}</span>
                    <span className={s.nodeName}>{r.factory}</span>
                    {/* A row backing nothing is a leftover — the mill was
                        renamed or its last product retired. Named rather than
                        hidden, because the admin can only clear what they see. */}
                    {r.skuCount === 0 ? (
                      <Badge tone="stale">بدون کالای فعال</Badge>
                    ) : (
                      <span className={s.nodeCount}>{toPersianDigits(r.skuCount)}</span>
                    )}
                    <IconButton
                      label={`جابه‌جایی ${r.factory} به بالا`}
                      size="sm"
                      disabled={i === 0 || busy}
                      icon={<ChevronDownIcon size={14} style={{ transform: 'rotate(180deg)' }} />}
                      onClick={() => move(r.factory, -1)}
                    />
                    <IconButton
                      label={`جابه‌جایی ${r.factory} به پایین`}
                      size="sm"
                      disabled={i === placed.length - 1 || busy}
                      icon={<ChevronDownIcon size={14} />}
                      onClick={() => move(r.factory, 1)}
                    />
                    <IconButton
                      label={`برداشتن ${r.factory} از ترتیب`}
                      size="sm"
                      disabled={busy}
                      icon={<CloseIcon size={14} />}
                      onClick={() => apply(placed.filter((x) => x.factory !== r.factory).map((x) => x.factory))}
                    />
                  </div>
                ))
              )}

              {rest.length > 0 ? (
                <>
                  <div className={s.factoryGroupHeader}>بقیه — بر اساس ارزان‌ترین قیمت، پس از فهرست بالا</div>
                  {rest.map((r) => (
                    <div key={r.factory} className={`${s.node} ${s.factoryRow}`}>
                      <span className={s.nodeName}>{r.factory}</span>
                      <span className={s.nodeCount}>{toPersianDigits(r.skuCount)}</span>
                      <IconButton
                        label={`افزودن ${r.factory} به ترتیب`}
                        size="sm"
                        disabled={busy}
                        icon={<PlusIcon size={14} />}
                        onClick={() => apply([...placed.map((x) => x.factory), r.factory])}
                      />
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
