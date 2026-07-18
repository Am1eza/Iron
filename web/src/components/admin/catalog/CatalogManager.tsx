'use client';
/** Catalog manager — categories → subs → SKUs with soft-delete only. */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatToman } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  IconButton,
  TableSkeleton,
  Tabs,
  TabPanel,
  useConfirm,
} from '@/components/ui';
import { ChevronDownIcon } from '@/components/primitives/icons';
import { TextInput } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
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
  imageUrl: string | null;
  isActive: boolean;
};

type CategoryRow = { id: string; slug: string; name: string; order: number; isActive: boolean };
type SubCategoryRow = { id: string; categoryId: string; slug: string; name: string; order: number; isActive: boolean };

export function CatalogManager() {
  const [tab, setTab] = useState('skus');
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <Tabs
        label="بخش‌های کاتالوگ"
        idBase="catalog"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'skus', label: 'کالاها' },
          { id: 'categories', label: 'دسته‌بندی‌ها' },
        ]}
      />
      <TabPanel id="skus" active={tab} idBase="catalog">
        <SkuManager />
      </TabPanel>
      <TabPanel id="categories" active={tab} idBase="catalog">
        <CategoryManager />
      </TabPanel>
    </div>
  );
}

/* ------------------------------- SKUs tab -------------------------------- */

function SkuManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
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

  const askDeactivate = (r: SkuRow) => {
    void confirm({
      title: 'غیرفعال‌سازی کالا',
      body: 'کالا از سایت پنهان می‌شود؛ تاریخچهٔ قیمت حفظ می‌شود. ادامه؟',
      confirmLabel: 'غیرفعال کن',
    }).then((ok) => {
      if (ok) deactivate.mutate(r.id);
    });
  };

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
          initial={{ name: '', slug: '', size: '', factory: '', unit: 'kg', theoreticalWeightKg: '', imageUrl: null }}
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
              imageUrl: v.imageUrl,
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
          <caption className="visually-hidden">فهرست کالاهای دستهٔ انتخاب‌شده</caption>
          <thead>
            <tr>
              <th scope="col">نام</th>
              <th scope="col">سایز</th>
              <th scope="col">کارخانه</th>
              <th scope="col">واحد</th>
              <th scope="col">قیمت فعلی</th>
              <th scope="col">وضعیت</th>
              <th scope="col">
                <span className="visually-hidden">عملیات</span>
              </th>
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
                        <Button size="sm" variant="ghost" onClick={() => askDeactivate(r)}>
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
            imageUrl: editing.imageUrl,
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
                imageUrl: v.imageUrl,
              },
            })
          }
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {dialog}
    </div>
  );
}

type SkuFormValues = {
  name: string;
  slug: string;
  size: string;
  factory: string;
  unit: string;
  theoreticalWeightKg: string;
  imageUrl: string | null;
};

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
      <Heading level={2}>{heading}</Heading>
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
      <div style={{ marginBlockStart: 'var(--space-3)' }}>
        <ImageUpload label="تصویر کالا" value={v.imageUrl} onChange={(imageUrl) => setV({ ...v, imageUrl })} />
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

/* --------------------------- Categories tab ------------------------------ */

function CategoryManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [selectedCatId, setSelectedCatId] = useState('');
  const [editingCat, setEditingCat] = useState<CategoryRow | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingSub, setEditingSub] = useState<SubCategoryRow | null>(null);
  const [creatingSub, setCreatingSub] = useState(false);
  const [reordering, setReordering] = useState(false);

  const cats = useQuery({ queryKey: ['admin', 'cat', 'categories'], queryFn: adminApi.categories });
  const subs = useQuery({
    queryKey: ['admin', 'cat', 'subs', selectedCatId],
    queryFn: () => adminApi.subCategories(selectedCatId || undefined),
    enabled: Boolean(selectedCatId),
  });

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'عملیات ناموفق بود.');
  const invalidateCats = () => void qc.invalidateQueries({ queryKey: ['admin', 'cat', 'categories'] });
  const invalidateSubs = () => void qc.invalidateQueries({ queryKey: ['admin', 'cat', 'subs'] });

  const createCat = useMutation({
    mutationFn: (body: { slug: string; name: string }) => adminApi.createCategory(body),
    onSuccess: () => {
      toast.success('دسته ساخته شد.');
      setCreatingCat(false);
      invalidateCats();
    },
    onError,
  });
  const patchCat = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => adminApi.updateCategory(id, body),
    onSuccess: () => {
      toast.success('دسته به‌روزرسانی شد.');
      setEditingCat(null);
      invalidateCats();
    },
    onError,
  });
  const deactivateCat = useMutation({
    mutationFn: (id: string) => adminApi.deactivateCategory(id),
    onSuccess: () => {
      toast.success('دسته غیرفعال شد.');
      invalidateCats();
    },
    onError,
  });

  const createSub = useMutation({
    mutationFn: (body: { categoryId: string; slug: string; name: string }) => adminApi.createSubCategory(body),
    onSuccess: () => {
      toast.success('زیر‌دسته ساخته شد.');
      setCreatingSub(false);
      invalidateSubs();
    },
    onError,
  });
  const patchSub = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => adminApi.updateSubCategory(id, body),
    onSuccess: () => {
      toast.success('زیر‌دسته به‌روزرسانی شد.');
      setEditingSub(null);
      invalidateSubs();
    },
    onError,
  });
  const deactivateSub = useMutation({
    mutationFn: (id: string) => adminApi.deactivateSubCategory(id),
    onSuccess: () => {
      toast.success('زیر‌دسته غیرفعال شد.');
      invalidateSubs();
    },
    onError,
  });

  const categoriesSorted = useMemo(
    () => [...(cats.data?.categories ?? [])].sort((a, b) => a.order - b.order),
    [cats.data],
  );
  const subsSorted = useMemo(() => [...(subs.data?.subCategories ?? [])].sort((a, b) => a.order - b.order), [subs.data]);

  /** Reorder = swap the `order` field with the neighbor — two direct PATCH
   *  calls (not routed through useMutation, so a single reorder produces one
   *  toast/one invalidate instead of two). */
  async function swapOrder(kind: 'category' | 'subCategory', a: { id: string; order: number }, b: { id: string; order: number }) {
    setReordering(true);
    try {
      if (kind === 'category') {
        await Promise.all([adminApi.updateCategory(a.id, { order: b.order }), adminApi.updateCategory(b.id, { order: a.order })]);
        invalidateCats();
      } else {
        await Promise.all([
          adminApi.updateSubCategory(a.id, { order: b.order }),
          adminApi.updateSubCategory(b.id, { order: a.order }),
        ]);
        invalidateSubs();
      }
    } catch (err) {
      onError(err);
    } finally {
      setReordering(false);
    }
  }

  const askDeactivateCategory = (c: CategoryRow) => {
    void confirm({
      title: 'غیرفعال‌سازی دسته',
      body: `دستهٔ «${c.name}» و امکان انتخاب آن در کاتالوگ و قیمت‌گذاری پنهان می‌شود؛ کالاهای موجودش دست‌نخورده می‌مانند. ادامه؟`,
      confirmLabel: 'غیرفعال کن',
    }).then((ok) => {
      if (ok) deactivateCat.mutate(c.id);
    });
  };
  const askDeactivateSub = (s: SubCategoryRow) => {
    void confirm({
      title: 'غیرفعال‌سازی زیر‌دسته',
      body: `زیر‌دستهٔ «${s.name}» پنهان می‌شود؛ کالاهای موجودش دست‌نخورده می‌مانند. ادامه؟`,
      confirmLabel: 'غیرفعال کن',
    }).then((ok) => {
      if (ok) deactivateSub.mutate(s.id);
    });
  };

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
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <Card>
        <div className={ui.toolbar}>
          <Heading level={2}>دسته‌ها</Heading>
          <Button size="sm" variant="secondary" style={{ marginInlineStart: 'auto' }} onClick={() => setCreatingCat(!creatingCat)}>
            دستهٔ جدید
          </Button>
        </div>

        {creatingCat ? (
          <CategoryForm
            heading="دستهٔ جدید"
            initial={{ name: '', slug: '' }}
            busy={createCat.isPending}
            onSubmit={(v) => createCat.mutate(v)}
            onCancel={() => setCreatingCat(false)}
          />
        ) : null}

        {cats.isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : categoriesSorted.length === 0 ? (
          <EmptyState size="section" headline="دسته‌ای نیست" body="با «دستهٔ جدید» اضافه کنید." />
        ) : (
          <table className={ui.table}>
            <caption className="visually-hidden">فهرست دسته‌های کاتالوگ</caption>
            <thead>
              <tr>
                <th scope="col">ترتیب</th>
                <th scope="col">نام</th>
                <th scope="col">وضعیت</th>
                <th scope="col">
                  <span className="visually-hidden">عملیات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categoriesSorted.map((c, i) => (
                <tr key={c.id} className={c.id === selectedCatId ? ui.rowDirty : undefined}>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      <IconButton
                        label={`جابه‌جایی «${c.name}» به بالا`}
                        size="sm"
                        icon={<ChevronDownIcon size={16} style={{ transform: 'rotate(180deg)' }} />}
                        disabled={i === 0 || reordering}
                        onClick={() => swapOrder('category', c, categoriesSorted[i - 1]!)}
                      />
                      <IconButton
                        label={`جابه‌جایی «${c.name}» به پایین`}
                        size="sm"
                        icon={<ChevronDownIcon size={16} />}
                        disabled={i === categoriesSorted.length - 1 || reordering}
                        onClick={() => swapOrder('category', c, categoriesSorted[i + 1]!)}
                      />
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={ui.linkButton}
                      onClick={() => setSelectedCatId(c.id === selectedCatId ? '' : c.id)}
                      aria-expanded={c.id === selectedCatId}
                    >
                      {c.name}
                    </button>
                    <div className={`${ui.muted} ${ui.mono}`}>{c.slug}</div>
                  </td>
                  <td>{c.isActive ? <Badge tone="gain">فعال</Badge> : <Badge tone="stale">غیرفعال</Badge>}</td>
                  <td>
                    <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCat(c)}>
                        ویرایش
                      </Button>
                      {c.isActive ? (
                        <Button size="sm" variant="ghost" onClick={() => askDeactivateCategory(c)}>
                          غیرفعال
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => patchCat.mutate({ id: c.id, body: { isActive: true } })}>
                          فعال‌سازی
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editingCat ? (
          <CategoryForm
            heading={`ویرایش ${editingCat.name}`}
            initial={{ name: editingCat.name, slug: editingCat.slug }}
            busy={patchCat.isPending}
            onSubmit={(v) => patchCat.mutate({ id: editingCat.id, body: v })}
            onCancel={() => setEditingCat(null)}
          />
        ) : null}
      </Card>

      {selectedCatId ? (
        <Card>
          <div className={ui.toolbar}>
            <Heading level={2}>زیر‌دسته‌های «{categoriesSorted.find((c) => c.id === selectedCatId)?.name}»</Heading>
            <Button size="sm" variant="secondary" style={{ marginInlineStart: 'auto' }} onClick={() => setCreatingSub(!creatingSub)}>
              زیر‌دستهٔ جدید
            </Button>
          </div>

          {creatingSub ? (
            <CategoryForm
              heading="زیر‌دستهٔ جدید"
              initial={{ name: '', slug: '' }}
              busy={createSub.isPending}
              onSubmit={(v) => createSub.mutate({ categoryId: selectedCatId, ...v })}
              onCancel={() => setCreatingSub(false)}
            />
          ) : null}

          {subs.isLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : subsSorted.length === 0 ? (
            <EmptyState size="section" headline="زیر‌دسته‌ای نیست" body="با «زیر‌دستهٔ جدید» اضافه کنید." />
          ) : (
            <table className={ui.table}>
              <caption className="visually-hidden">فهرست زیر‌دسته‌های دستهٔ انتخاب‌شده</caption>
              <thead>
                <tr>
                  <th scope="col">ترتیب</th>
                  <th scope="col">نام</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">
                    <span className="visually-hidden">عملیات</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subsSorted.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <IconButton
                          label={`جابه‌جایی «${s.name}» به بالا`}
                          size="sm"
                          icon={<ChevronDownIcon size={16} style={{ transform: 'rotate(180deg)' }} />}
                          disabled={i === 0 || reordering}
                          onClick={() => swapOrder('subCategory', s, subsSorted[i - 1]!)}
                        />
                        <IconButton
                          label={`جابه‌جایی «${s.name}» به پایین`}
                          size="sm"
                          icon={<ChevronDownIcon size={16} />}
                          disabled={i === subsSorted.length - 1 || reordering}
                          onClick={() => swapOrder('subCategory', s, subsSorted[i + 1]!)}
                        />
                      </span>
                    </td>
                    <td>
                      {s.name}
                      <div className={`${ui.muted} ${ui.mono}`}>{s.slug}</div>
                    </td>
                    <td>{s.isActive ? <Badge tone="gain">فعال</Badge> : <Badge tone="stale">غیرفعال</Badge>}</td>
                    <td>
                      <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <Button size="sm" variant="ghost" onClick={() => setEditingSub(s)}>
                          ویرایش
                        </Button>
                        {s.isActive ? (
                          <Button size="sm" variant="ghost" onClick={() => askDeactivateSub(s)}>
                            غیرفعال
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => patchSub.mutate({ id: s.id, body: { isActive: true } })}>
                            فعال‌سازی
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {editingSub ? (
            <CategoryForm
              heading={`ویرایش ${editingSub.name}`}
              initial={{ name: editingSub.name, slug: editingSub.slug }}
              busy={patchSub.isPending}
              onSubmit={(v) => patchSub.mutate({ id: editingSub.id, body: v })}
              onCancel={() => setEditingSub(null)}
            />
          ) : null}
        </Card>
      ) : null}
      {dialog}
    </div>
  );
}

type CategoryFormValues = { name: string; slug: string };

/** Shared name+slug form for both categories and sub-categories — same shape,
 *  same validation; `order` is managed separately via the up/down reorder
 *  buttons so a typo here can never scramble display order. */
function CategoryForm({
  heading,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  heading: string;
  initial: CategoryFormValues;
  busy: boolean;
  onSubmit: (v: CategoryFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Card>
      <Heading level={3}>{heading}</Heading>
      <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
        <TextInput label="نام" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <TextInput label="نشانی (slug)" dir="ltr" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      </div>
      <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
        <Button size="sm" onClick={() => onSubmit(v)} disabled={!v.name || !v.slug} loading={busy}>
          ذخیره
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </Card>
  );
}
