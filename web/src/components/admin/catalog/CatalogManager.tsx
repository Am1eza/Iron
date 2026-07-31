'use client';
/**
 * Catalog manager (rebuilt, W24).
 *
 * The old screen split the catalog into two tabs that hid each other, gated
 * the product list behind "pick a category first", and — the actual bug —
 * never sent a page number nor read the `total` the API returns, so with more
 * than 50 products in a scope the admin was silently looking at the first 50
 * and believed that was all of them.
 *
 * Shape now: a persistent taxonomy rail that FILTERS a paginated, searchable
 * product index, with the editor in a drawer. Everything the schema holds is
 * reachable, nothing is hidden, and every destructive action states what it
 * will take down before it does it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  type AdminCategory,
  type AdminSku,
  type AdminSubCategory,
} from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';
import { useToast } from '@/lib/hooks/useToast';
import { Alert, Badge, Button, Chip, EmptyState, Modal, TableSkeleton, useConfirm } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import { PagerFooter } from '../PagerFooter';
import { TaxonomyRail, type RailSelection } from './TaxonomyRail';
import { SkuDrawer } from './SkuDrawer';
import ui from '../adminUi.module.css';
import s from './catalog.module.css';

const UNIT_LABEL: Record<string, string> = { kg: 'کیلوگرم', branch: 'شاخه', sheet: 'برگ', meter: 'متر' };

type NodeDraft =
  | { kind: 'category'; row: AdminCategory | null }
  | { kind: 'sub'; row: AdminSubCategory | null; categoryId: string };

export function CatalogManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [sel, setSel] = useState<RailSelection>({ categoryId: '', subCategoryId: '' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [drawer, setDrawer] = useState<{ sku: AdminSku | null } | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'عملیات ناموفق بود.');

  const cats = useQuery({ queryKey: ['admin', 'cat', 'categories'], queryFn: adminApi.categories });
  const categories = useMemo(
    () => [...(cats.data?.categories ?? [])].sort((a, b) => a.order - b.order),
    [cats.data],
  );

  // All sub-categories in one request — the rail shows every expanded branch
  // at once, so per-category fetching would fire a request per twisty click.
  const allSubs = useQuery({ queryKey: ['admin', 'cat', 'subs', 'all'], queryFn: () => adminApi.subCategories() });
  const subsByCategory = useMemo(() => {
    const out: Record<string, AdminSubCategory[]> = {};
    for (const x of [...(allSubs.data?.subCategories ?? [])].sort((a, b) => a.order - b.order)) {
      (out[x.categoryId] ??= []).push(x);
    }
    return out;
  }, [allSubs.data]);

  const skus = useQuery({
    queryKey: ['admin', 'cat', 'skus', sel.categoryId, sel.subCategoryId, q, status, page],
    queryFn: () =>
      adminApi.skus({
        // While searching, ignore the rail: the badge tells the admin the
        // search spans every category, so the request has to actually do it.
        categoryId: q ? undefined : sel.categoryId || undefined,
        subCategoryId: q ? undefined : sel.subCategoryId || undefined,
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        all: status === 'all',
        page,
      }),
  });

  const rows = skus.data?.rows ?? [];
  const total = skus.data?.total ?? 0;
  const perPage = skus.data?.perPage ?? 50;

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'cat'] });
    // The pricing grid and the dashboard read the same taxonomy with a
    // 5-minute staleTime; without these a product created here doesn't show
    // up in «قیمت‌گذاری» until that window expires.
    void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'subcategories'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'pricing'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };

  // Any filter change invalidates both the page number and the selection — a
  // stale selection surviving a filter change could bulk-toggle rows the
  // admin can no longer see.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [sel.categoryId, sel.subCategoryId, q, status]);

  // Paging away strands the selection off-screen, and the bulk bar would then
  // act on rows the admin cannot see.
  useEffect(() => {
    setSelected(new Set());
  }, [page]);

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.updateSku(id, { isActive }),
    onSuccess: (_d, vars) => {
      toast.success(vars.isActive ? 'کالا فعال شد.' : 'کالا غیرفعال شد (تاریخچهٔ قیمت حفظ می‌شود).');
      invalidateAll();
    },
    onError,
  });

  /** Deactivation states its blast radius first — the old dialog was a fixed
   *  string that did not even name the product. */
  const askDeactivateSku = async (r: AdminSku) => {
    let impact: Awaited<ReturnType<typeof adminApi.skuImpact>> | null = null;
    try {
      impact = await adminApi.skuImpact(r.id);
    } catch {
      // The confirm still has to work if the impact lookup fails.
    }
    const ok = await confirm({
      title: `غیرفعال‌سازی «${r.name}»`,
      body: (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span>صفحهٔ این کالا در سایت دیگر باز نمی‌شود و از جدول قیمت‌ها، جستجو و نقشهٔ سایت حذف می‌شود.</span>
          {impact && impact.openLeads > 0 ? (
            <span>‏{toPersianDigits(impact.openLeads)} سرنخ باز این کالا را در اقلام دارد — پیش‌فاکتورهای صادرشده تغییر نمی‌کنند.</span>
          ) : null}
          {impact && impact.openOrders > 0 ? (
            <span>‏{toPersianDigits(impact.openOrders)} سفارش در جریان این کالا را دارد.</span>
          ) : null}
          {impact && (impact.favorites > 0 || impact.activeAlerts > 0) ? (
            <span>
              ‏{toPersianDigits(impact.favorites)} کاربر نشانش کرده‌اند و {toPersianDigits(impact.activeAlerts)} هشدار
              قیمت رویش فعال است.
            </span>
          ) : null}
          <span>تاریخچهٔ قیمت حفظ می‌شود؛ هر زمان می‌توانید برش گردانید.</span>
        </div>
      ),
      confirmLabel: 'غیرفعال کن',
    });
    if (ok) setActive.mutate({ id: r.id, isActive: false });
  };

  const askDeactivateCategory = async (c: AdminCategory) => {
    const ok = await confirm({
      title: `غیرفعال‌سازی دستهٔ «${c.name}»`,
      body: (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span>
            این دسته {toPersianDigits(c.subCount)} زیر‌دسته و {toPersianDigits(c.skuCount)} کالای فعال دارد.
          </span>
          {/* The old copy said the products stay untouched. They do in the
              panel — but every one of their public pages 404s, which is the
              opposite of what the admin was told. */}
          <span>
            با غیرفعال‌شدن دسته، صفحهٔ هر {toPersianDigits(c.skuCount)} کالا در سایت هم بسته می‌شود — نه فقط خود دسته.
            وضعیت کالاها در پنل تغییر نمی‌کند و با فعال‌کردن دوبارهٔ دسته همه برمی‌گردند.
          </span>
        </div>
      ),
      confirmLabel: 'غیرفعال کن',
    });
    if (!ok) return;
    try {
      await adminApi.deactivateCategory(c.id);
      toast.success('دسته غیرفعال شد.');
      if (sel.categoryId === c.id) setSel({ categoryId: '', subCategoryId: '' });
      invalidateAll();
    } catch (err) {
      onError(err);
    }
  };

  const askDeactivateSub = async (x: AdminSubCategory) => {
    const ok = await confirm({
      title: `غیرفعال‌سازی زیر‌دستهٔ «${x.name}»`,
      body: (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span>این زیر‌دسته {toPersianDigits(x.skuCount)} کالای فعال دارد.</span>
          <span>
            صفحهٔ زیر‌دسته و صفحهٔ هر {toPersianDigits(x.skuCount)} کالای آن در سایت بسته می‌شود. وضعیت کالاها در پنل
            تغییر نمی‌کند.
          </span>
        </div>
      ),
      confirmLabel: 'غیرفعال کن',
    });
    if (!ok) return;
    try {
      await adminApi.deactivateSubCategory(x.id);
      toast.success('زیر‌دسته غیرفعال شد.');
      if (sel.subCategoryId === x.id) setSel({ categoryId: sel.categoryId, subCategoryId: '' });
      invalidateAll();
    } catch (err) {
      onError(err);
    }
  };

  const bulkSetActive = async (isActive: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: isActive ? 'فعال‌سازی گروهی' : 'غیرفعال‌سازی گروهی',
      body: isActive
        ? `${toPersianDigits(ids.length)} کالا دوباره در سایت نمایش داده می‌شود.`
        : `صفحهٔ ${toPersianDigits(ids.length)} کالا در سایت بسته می‌شود. تاریخچهٔ قیمت حفظ می‌شود.`,
      confirmLabel: isActive ? 'فعال کن' : 'غیرفعال کن',
    });
    if (!ok) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => adminApi.updateSku(id, { isActive })));
    setBulkBusy(false);
    const failedIds = ids.filter((_id, i) => results[i]!.status === 'rejected');
    if (failedIds.length > 0) {
      // Keep the failures selected so «دوباره تلاش» is one click, instead of
      // reporting a bare count and clearing the selection.
      setSelected(new Set(failedIds));
      toast.error(`${toPersianDigits(failedIds.length)} کالا به‌روزرسانی نشد؛ همان‌ها انتخاب مانده‌اند.`);
    } else {
      setSelected(new Set());
      toast.success(`${toPersianDigits(ids.length)} کالا ${isActive ? 'فعال' : 'غیرفعال'} شد.`);
    }
    invalidateAll();
  };

  /** Reorder writes the whole neighbourhood in one go and always refetches,
   *  so a partial failure can't leave the rail rendering numbers the DB no
   *  longer has. */
  const visibleIds = useMemo(
    () =>
      new Set([
        ...categories.filter((c) => c.isActive).map((c) => c.id),
        ...Object.values(subsByCategory).flat().filter((x) => x.isActive).map((x) => x.id),
      ]),
    [categories, subsByCategory],
  );

  const move = async (list: Array<{ id: string; order: number }>, id: string, dir: -1 | 1, kind: 'category' | 'sub') => {
    // Addressed by id, not index: the rail renders a filtered list when
    // «نمایش غیرفعال‌ها» is off, so an index into what the admin SEES would
    // move the wrong row here.
    const index = list.findIndex((x) => x.id === id);
    if (index < 0) return;
    // Step to the nearest neighbour the admin can actually SEE. With
    // «نمایش غیرفعال‌ها» off, index ± 1 could swap past a hidden row and
    // leave the rail visually unchanged while still writing two PATCHes.
    const isVisible = (x: { id: string }) => showInactive || visibleIds.has(x.id);
    let target = index + dir;
    while (target >= 0 && target < list.length && !isVisible(list[target]!)) target += dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    // Only rows whose ORDER actually changes — every PATCH writes an audit
    // entry and purges the root-layout cache. Comparing order (not position)
    // also renumbers correctly when existing rows share a value: the old
    // create path defaulted every new node to 99, so ties are common.
    const byId = new Map(list.map((x) => [x.id, x.order]));
    const changed = next
      .map((x, i) => ({ id: x.id, order: i + 1 }))
      .filter((x) => byId.get(x.id) !== x.order);
    if (changed.length === 0) return;
    setReordering(true);
    try {
      await Promise.all(
        changed.map((x) =>
          kind === 'category'
            ? adminApi.updateCategory(x.id, { order: x.order })
            : adminApi.updateSubCategory(x.id, { order: x.order }),
        ),
      );
      toast.success('ترتیب ذخیره شد.');
    } catch (err) {
      onError(err);
    } finally {
      setReordering(false);
      invalidateAll();
    }
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Every sub, always: scoping this to the selected category made the
  // cross-category move the drawer advertises impossible without first
  // clicking «همهٔ کالاها». The optgroup grouping keeps the list legible.
  const subsForDrawer = useMemo(() => Object.values(subsByCategory).flat(), [subsByCategory]);

  const inactiveHint = status === 'active' && total > 0;

  if (cats.isError) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="بارگذاری کاتالوگ ناموفق بود."
        primary={{ label: 'تلاش دوباره', onClick: () => void cats.refetch() }}
      />
    );
  }

  return (
    <div className={s.shell}>
      <TaxonomyRail
        categories={categories}
        subsByCategory={subsByCategory}
        selection={sel}
        onSelect={setSel}
        expanded={expanded}
        onExpand={toggleExpand}
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        busy={reordering}
        onNewCategory={() => setNodeDraft({ kind: 'category', row: null })}
        onNewSub={(categoryId) => setNodeDraft({ kind: 'sub', row: null, categoryId })}
        onEditCategory={(c) => setNodeDraft({ kind: 'category', row: c })}
        onEditSub={(x) => setNodeDraft({ kind: 'sub', row: x, categoryId: x.categoryId })}
        onDeactivateCategory={(c) => void askDeactivateCategory(c)}
        onDeactivateSub={(x) => void askDeactivateSub(x)}
        onReactivateCategory={(c) =>
          void adminApi
            .updateCategory(c.id, { isActive: true })
            .then(() => {
              toast.success('دسته فعال شد.');
              invalidateAll();
            })
            .catch(onError)
        }
        onReactivateSub={(x) =>
          void adminApi
            .updateSubCategory(x.id, { isActive: true })
            .then(() => {
              toast.success('زیر‌دسته فعال شد.');
              invalidateAll();
            })
            .catch(onError)
        }
        onMoveCategory={(id, dir) => void move(categories, id, dir, 'category')}
        onMoveSub={(categoryId, subId, dir) => void move(subsByCategory[categoryId] ?? [], subId, dir, 'sub')}
      />

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <div className={ui.toolbar}>
          <input
            type="search"
            className={ui.textCell}
            style={{ inlineSize: '16rem' }}
            placeholder="جستجو در نام، نشانی، سایز، کارخانه…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="جستجوی کالا"
          />
          <Chip selected={status === 'active'} onClick={() => setStatus('active')}>
            فعال
          </Chip>
          <Chip selected={status === 'inactive'} onClick={() => setStatus('inactive')}>
            غیرفعال
          </Chip>
          <Chip selected={status === 'all'} onClick={() => setStatus('all')}>
            همه
          </Chip>
          <span className={ui.muted}>
            {toPersianDigits(total)} کالا
            {skus.isFetching ? ' · در حال به‌روزرسانی…' : ''}
          </span>
          <Button
            size="sm"
            variant="secondary"
            style={{ marginInlineStart: 'auto' }}
            onClick={() => setDrawer({ sku: null })}
          >
            کالای جدید
          </Button>
        </div>

        {q ? (
          <div className={ui.toolbar}>
            <Badge tone="info">جستجو در همهٔ دسته‌ها</Badge>
            <Button size="sm" variant="ghost" onClick={() => setSearch('')}>
              پاک‌کردن جستجو
            </Button>
          </div>
        ) : null}

        {selected.size > 0 ? (
          <div className={ui.stickyBar}>
            <span>{toPersianDigits(selected.size)} کالا انتخاب شده.</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                لغو انتخاب
              </Button>
              <Button size="sm" variant="ghost" loading={bulkBusy} onClick={() => void bulkSetActive(true)}>
                فعال‌سازی {toPersianDigits(selected.size)} کالا
              </Button>
              <Button size="sm" loading={bulkBusy} onClick={() => void bulkSetActive(false)}>
                غیرفعال‌سازی {toPersianDigits(selected.size)} کالا
              </Button>
            </div>
          </div>
        ) : null}

        {skus.isLoading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : skus.isError ? (
          <EmptyState
            size="section"
            tone="error"
            headline="بارگذاری کالاها ناموفق بود."
            primary={{ label: 'تلاش دوباره', onClick: () => void skus.refetch() }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            size="section"
            headline={q ? `کالایی با «${q}» پیدا نشد` : 'کالایی در این نما نیست'}
            body={q ? 'شاید در نمای دیگری باشد — فیلتر وضعیت را «همه» کنید.' : 'با «کالای جدید» اضافه کنید.'}
            primary={
              q
                ? { label: 'پاک‌کردن جستجو', onClick: () => setSearch('') }
                : { label: 'کالای جدید', onClick: () => setDrawer({ sku: null }) }
            }
          />
        ) : (
          <>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <caption className="visually-hidden">فهرست کالاهای نمای انتخاب‌شده</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="انتخاب همهٔ کالاهای این صفحه"
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.sku.id))}
                        ref={(el) => {
                          if (el) {
                            const some = rows.some((r) => selected.has(r.sku.id));
                            el.indeterminate = some && !rows.every((r) => selected.has(r.sku.id));
                          }
                        }}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(rows.map((r) => r.sku.id)) : new Set())
                        }
                      />
                    </th>
                    <th scope="col">نام</th>
                    <th scope="col">سایز</th>
                    <th scope="col">کارخانه</th>
                    <th scope="col">گرید</th>
                    <th scope="col">واحد</th>
                    <th scope="col">قیمت فعلی</th>
                    <th scope="col">وضعیت</th>
                    <th scope="col">
                      <span className="visually-hidden">عملیات</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ sku: r, price }) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`انتخاب ${r.name}`}
                          checked={selected.has(r.id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className={s.nameCell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {r.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.imageUrl} alt="" className={s.thumb} />
                          ) : null}
                          <span>
                            {r.name}
                            <div className={`${ui.muted} ${ui.mono}`}>{r.slug}</div>
                          </span>
                        </div>
                      </td>
                      <td className="tnum">{r.size ?? '—'}</td>
                      <td>{r.factory ?? '—'}</td>
                      <td>{r.grade ?? r.standard ?? '—'}</td>
                      <td>{UNIT_LABEL[r.unit] ?? r.unit}</td>
                      <td className="tnum">{price ? `${formatToman(price.price, false)} تومان` : '—'}</td>
                      <td>
                        {r.isActive ? <Badge tone="gain">فعال</Badge> : <Badge tone="stale">غیرفعال</Badge>}
                        {r.isActive && !price ? <div className={ui.tileHintWarn}>بدون قیمت</div> : null}
                      </td>
                      <td>
                        <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          <Button size="sm" variant="ghost" onClick={() => setDrawer({ sku: r })}>
                            ویرایش
                          </Button>
                          {r.isActive ? (
                            <Button size="sm" variant="ghost" onClick={() => void askDeactivateSku(r)}>
                              غیرفعال
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActive.mutate({ id: r.id, isActive: true })}
                            >
                              فعال‌سازی
                            </Button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The list is paginated server-side; without this the admin saw
                the first 50 rows and had no way to know more existed. */}
            <PagerFooter page={page} perPage={perPage} total={total} onPage={setPage} />
            {inactiveHint ? (
              <span className={ui.tileHint}>
                نمای «فعال» را می‌بینید — برای دیدن کالاهای غیرفعال روی «غیرفعال» یا «همه» بزنید.
              </span>
            ) : null}
          </>
        )}
      </div>

      {/* `key` is the fix for the worst defect in the old screen: without it
          React reused the form instance, so clicking «ویرایش» on a second row
          kept the first row's typed values and saved them onto the second. */}
      {drawer ? (
        <SkuDrawer
          key={drawer.sku?.id ?? 'new'}
          sku={drawer.sku}
          categories={categories}
          subs={subsForDrawer}
          defaultSubId={sel.subCategoryId}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            invalidateAll();
          }}
        />
      ) : null}

      {nodeDraft ? (
        <NodeModal
          key={nodeDraft.kind + (nodeDraft.row?.id ?? 'new')}
          draft={nodeDraft}
          categories={categories}
          onClose={() => setNodeDraft(null)}
          onSaved={() => {
            setNodeDraft(null);
            invalidateAll();
          }}
        />
      ) : null}

      {dialog}
    </div>
  );
}

/** Create/edit for a category or sub-category. Sub-categories additionally
 *  carry a destination category, so a mis-filed branch can be moved instead of
 *  retired and rebuilt. */
function NodeModal({
  draft,
  categories,
  onClose,
  onSaved,
}: {
  draft: NodeDraft;
  categories: AdminCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = Boolean(draft.row);
  const [name, setName] = useState(draft.row?.name ?? '');
  const [slug, setSlug] = useState(draft.row?.slug ?? '');
  const [categoryId, setCategoryId] = useState(
    draft.kind === 'sub' ? (draft.row?.categoryId ?? draft.categoryId) : '',
  );
  const [advanced, setAdvanced] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Existing rows are hand-authored: re-deriving a live slug from its name
  // would break the indexed URL. Only a new node auto-follows the name.
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const iconRow = draft.kind === 'category' ? (draft.row as AdminCategory | null) : null;
  const [iconId, setIconId] = useState(iconRow?.iconId ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(iconRow?.imageUrl ?? null);

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

  const save = useMutation({
    // The two branches return differently-shaped payloads and neither is used
    // — the caller just refetches — so the result is deliberately widened.
    mutationFn: async (): Promise<void> => {
      if (draft.kind === 'category') {
        if (draft.row) await adminApi.updateCategory(draft.row.id, { name, slug, iconId, imageUrl });
        else await adminApi.createCategory({ name, slug, iconId, imageUrl });
        return;
      }
      if (draft.row) await adminApi.updateSubCategory(draft.row.id, { name, slug, categoryId });
      else await adminApi.createSubCategory({ categoryId, name, slug });
    },
    onSuccess: () => {
      toast.success('ذخیره شد.');
      onSaved();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
      toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.');
    },
  });

  const title =
    draft.kind === 'category'
      ? isEdit
        ? 'ویرایش دسته'
        : 'دستهٔ جدید'
      : isEdit
        ? 'ویرایش زیر‌دسته'
        : 'زیر‌دستهٔ جدید';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || !slugValid || (draft.kind === 'sub' && !categoryId)}
            loading={save.isPending}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {draft.kind === 'sub' ? (
          <div>
            <label className={ui.tileLabel} htmlFor="node-cat">
              دستهٔ والد
            </label>
            <select
              id="node-cat"
              className={ui.select}
              style={{ inlineSize: '100%' }}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {isEdit && categoryId !== draft.row?.categoryId ? (
              <div className={ui.tileHintWarn}>
                کالاهای این زیر‌دسته هم به دستهٔ جدید منتقل می‌شوند و نشانی صفحه‌شان عوض می‌شود.
              </div>
            ) : null}
          </div>
        ) : null}

        <TextInput
          label="نام"
          required
          helper="نام فارسی — همان‌طور که در منو و سایت دیده می‌شود."
          value={name}
          error={fieldErrors.name}
          maxLength={80}
          onChange={(e) => {
            const nextName = e.target.value;
            setName(nextName);
            // Only while creating: in edit mode this used to stay armed, so
            // fixing a typo in a name silently changed the public URL.
            if (!slugTouched) setSlug(slugify(nextName));
          }}
        />

        {/* The URL is derived and shown, never asked for. A duplicate is
            settled server-side by suffixing, so the admin cannot be handed an
            error about a concept they have never heard of. */}
        <div className={s.slugPreview}>نشانی صفحه: /prices/{slug || '…'}</div>

        {draft.kind === 'category' ? (
          <>
            <div>
              <label className={ui.tileLabel} htmlFor="node-icon">
                آیکون منو
              </label>
              <select
                id="node-icon"
                className={ui.select}
                style={{ inlineSize: '100%' }}
                value={iconId}
                onChange={(e) => setIconId(e.target.value)}
              >
                {CATEGORY_ICONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className={ui.tileHint}>در مگا‌منو و صفحهٔ اول کنار نام دسته دیده می‌شود.</div>
            </div>
            <ImageUpload label="تصویر دسته" value={imageUrl} onChange={setImageUrl} />
          </>
        ) : null}

        <div>
          <Button size="sm" variant="ghost" aria-expanded={advanced} onClick={() => setAdvanced((x) => !x)}>
            {advanced ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
          </Button>
          {advanced ? (
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              {isEdit ? (
                <Alert tone="warning">
                  نشانی فعلی در گوگل ثبت شده؛ با تغییر آن انتقال خودکار از نشانی قدیمی ساخته می‌شود تا لینک‌های قبلی
                  نشکنند.
                </Alert>
              ) : null}
              <TextInput
                label="نشانی صفحه"
                dir="ltr"
                helper="خودکار از روی نام ساخته می‌شود؛ فقط اگر دلیل خاصی دارید تغییرش دهید."
                value={slug}
                error={fieldErrors.slug ?? (slug && !slugValid ? 'فقط حروف کوچک انگلیسی، عدد و خط تیره.' : undefined)}
                maxLength={60}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/** The glyphs `CategoryGlyph` can actually render — anything else falls back
 *  to a generic shape, so this is a closed list rather than a free text box. */
const CATEGORY_ICONS: Array<{ id: string; label: string }> = [
  { id: '', label: 'پیش‌فرض' },
  { id: 'cat-rebar', label: 'میلگرد' },
  { id: 'cat-ibeam', label: 'تیرآهن' },
  { id: 'cat-profile', label: 'پروفیل و قوطی' },
  { id: 'cat-hot-sheet', label: 'ورق گرم' },
  { id: 'cat-cold-sheet', label: 'ورق سرد' },
  { id: 'cat-angle-channel', label: 'نبشی و ناودانی' },
  { id: 'cat-pipe', label: 'لوله' },
];
