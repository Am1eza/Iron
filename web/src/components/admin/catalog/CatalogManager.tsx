'use client';
/** Catalog manager — categories → subs → SKUs with soft-delete only. */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatToman } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Card, EmptyState, Heading, TableSkeleton } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import ui from '../adminUi.module.css';

type SkuRow = {
  id: string;
  slug: string;
  name: string;
  size: string | null;
  grade: string | null;
  factory: string | null;
  unit: string;
  theoreticalWeightKg: number | null;
  isActive: boolean;
};

export function CatalogManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [editing, setEditing] = useState<SkuRow | null>(null);
  const [creating, setCreating] = useState(false);

  const cats = useQuery({ queryKey: ['admin', 'cat', 'categories'], queryFn: adminApi.categories });
  const subs = useQuery({
    queryKey: ['admin', 'cat', 'subs', categoryId],
    queryFn: () => adminApi.subCategories(categoryId || undefined),
    enabled: Boolean(categoryId),
  });
  const skus = useQuery({
    queryKey: ['admin', 'cat', 'skus', categoryId, subCategoryId],
    queryFn: () =>
      adminApi.skus({ categoryId: categoryId || undefined, subCategoryId: subCategoryId || undefined, all: true }),
    enabled: Boolean(categoryId),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'cat', 'skus'] });
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'عملیات ناموفق بود.');

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => adminApi.updateSku(id, body),
    onSuccess: () => {
      toast.success('ذخیره شد.');
      setEditing(null);
      invalidate();
    },
    onError,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => adminApi.deactivateSku(id),
    onSuccess: () => {
      toast.success('کالا غیرفعال شد (تاریخچهٔ قیمت حفظ می‌شود).');
      invalidate();
    },
    onError,
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminApi.createSku(body),
    onSuccess: () => {
      toast.success('کالا ساخته شد؛ از «قیمت‌گذاری» قیمتش را ثبت کنید.');
      setCreating(false);
      invalidate();
    },
    onError,
  });

  const rows = (skus.data?.rows ?? []).map((r) => r.sku as unknown as SkuRow & { subCategoryId: string });
  // O(1) lookup instead of an O(n) `.find()` per row (this ran twice per row
  // inside the table body's `.map`, making the render O(n²) on the SKU list).
  const priceById = useMemo(() => {
    const map = new Map<string, number | undefined>();
    for (const r of skus.data?.rows ?? []) {
      map.set((r.sku as { id?: string }).id ?? '', (r.price as { price?: number } | null)?.price);
    }
    return map;
  }, [skus.data]);

  if (cats.isError) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="بارگذاری دسته‌ها ناموفق بود."
        primary={{ label: 'تلاش دوباره', onClick: () => void cats.refetch() }}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div className={ui.toolbar}>
        <select
          className={ui.select}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setSubCategoryId('');
          }}
          aria-label="دسته"
        >
          <option value="">انتخاب دسته…</option>
          {(cats.data?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={ui.select}
          value={subCategoryId}
          onChange={(e) => setSubCategoryId(e.target.value)}
          aria-label="زیر‌دسته"
          disabled={!categoryId}
        >
          <option value="">همهٔ زیر‌دسته‌ها</option>
          {(subs.data?.subCategories ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {categoryId ? (
          <Button size="sm" variant="secondary" style={{ marginInlineStart: 'auto' }} onClick={() => setCreating(!creating)}>
            کالای جدید
          </Button>
        ) : null}
      </div>

      {creating && categoryId ? (
        <SkuForm
          heading="کالای جدید"
          initial={{ name: '', slug: '', size: '', factory: '', unit: 'kg', theoreticalWeightKg: '' }}
          busy={create.isPending}
          onSubmit={(v) =>
            create.mutate({
              categoryId,
              subCategoryId: subCategoryId || (subs.data?.subCategories[0]?.id ?? ''),
              slug: v.slug,
              name: v.name,
              size: v.size || undefined,
              factory: v.factory || undefined,
              unit: v.unit,
              theoreticalWeightKg: v.theoreticalWeightKg ? Number(v.theoreticalWeightKg) : undefined,
            })
          }
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {!categoryId ? (
        <EmptyState size="section" headline="یک دسته انتخاب کنید" body="کالاهای هر دسته اینجا فهرست می‌شود." />
      ) : skus.isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : skus.isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری کالاها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void skus.refetch() }}
        />
      ) : rows.length === 0 ? (
        <EmptyState size="section" headline="کالایی نیست" body="با «کالای جدید» اضافه کنید." />
      ) : (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>نام</th>
              <th>سایز</th>
              <th>کارخانه</th>
              <th>واحد</th>
              <th>قیمت فعلی</th>
              <th>وضعیت</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const price = priceById.get(r.id);
              return (
              <tr key={r.id}>
                <td>
                  {r.name}
                  <div className={`${ui.muted} ${ui.mono}`}>{r.slug}</div>
                </td>
                <td className="tnum">{r.size ?? '—'}</td>
                <td>{r.factory ?? '—'}</td>
                <td>{r.unit === 'kg' ? 'کیلوگرم' : r.unit === 'branch' ? 'شاخه' : r.unit === 'sheet' ? 'برگ' : 'متر'}</td>
                <td className="tnum">{price ? `${formatToman(price, false)} تومان` : '—'}</td>
                <td>{r.isActive ? <Badge tone="gain">فعال</Badge> : <Badge tone="stale">غیرفعال</Badge>}</td>
                <td>
                  <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                      ویرایش
                    </Button>
                    {r.isActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm('کالا از سایت پنهان می‌شود؛ تاریخچهٔ قیمت حفظ می‌شود. ادامه؟')) {
                            deactivate.mutate(r.id);
                          }
                        }}
                      >
                        غیرفعال
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { isActive: true } })}>
                        فعال‌سازی
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing ? (
        <SkuForm
          heading={`ویرایش ${editing.name}`}
          initial={{
            name: editing.name,
            slug: editing.slug,
            size: editing.size ?? '',
            factory: editing.factory ?? '',
            unit: editing.unit,
            theoreticalWeightKg: editing.theoreticalWeightKg ? String(editing.theoreticalWeightKg) : '',
          }}
          busy={patch.isPending}
          onSubmit={(v) =>
            patch.mutate({
              id: editing.id,
              body: {
                name: v.name,
                slug: v.slug,
                size: v.size || undefined,
                factory: v.factory || undefined,
                unit: v.unit,
                theoreticalWeightKg: v.theoreticalWeightKg ? Number(v.theoreticalWeightKg) : undefined,
              },
            })
          }
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

type SkuFormValues = { name: string; slug: string; size: string; factory: string; unit: string; theoreticalWeightKg: string };

function SkuForm({
  heading,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  heading: string;
  initial: SkuFormValues;
  busy: boolean;
  onSubmit: (v: SkuFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Card>
      <Heading level={3}>{heading}</Heading>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="نام" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <TextInput label="نشانی (slug)" dir="ltr" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
        <TextInput label="سایز" value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} />
        <TextInput label="کارخانه" value={v.factory} onChange={(e) => setV({ ...v, factory: e.target.value })} />
        <div>
          <label className={ui.muted} htmlFor="sku-unit">
            واحد فروش
          </label>
          <br />
          <select id="sku-unit" className={ui.select} value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })}>
            <option value="kg">کیلوگرم</option>
            <option value="branch">شاخه</option>
            <option value="sheet">برگ</option>
            <option value="meter">متر</option>
          </select>
        </div>
        <TextInput
          label="وزن تئوری (کیلوگرم)"
          inputMode="decimal"
          value={v.theoreticalWeightKg}
          onChange={(e) => setV({ ...v, theoreticalWeightKg: e.target.value })}
        />
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button onClick={() => onSubmit(v)} disabled={!v.name || !v.slug} loading={busy}>
          ذخیره
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </Card>
  );
}
