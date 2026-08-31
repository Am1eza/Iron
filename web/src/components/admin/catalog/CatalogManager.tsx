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
import { displayOrder } from '@/lib/utils/catalogGroups';
import { useToast } from '@/lib/hooks/useToast';
import { useDeepLinkQuery } from '@/lib/hooks/useDeepLinkQuery';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Modal,
  TableSkeleton,
  useConfirm,
} from '@/components/ui';
import { TextInput, Textarea, PickerInput } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import { PagerFooter } from '../PagerFooter';
import { TaxonomyRail, type RailSelection } from './TaxonomyRail';
import { SkuDrawer } from './SkuDrawer';
import { FactoryOrderPanel } from './FactoryOrderPanel';
import ui from '../adminUi.module.css';
import s from './catalog.module.css';

const UNIT_LABEL: Record<string, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
  piece: 'عدد',
};

type NodeDraft =
  | { kind: 'category'; row: AdminCategory | null }
  | { kind: 'sub'; row: AdminSubCategory | null; categoryId: string };

export function CatalogManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [sel, setSel] = useState<RailSelection>({ categoryId: '', subCategoryId: '' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
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

  // `/admin/catalog?q=slug` from the command palette. Sets the committed term
  // too, not just the box, so the filtered list is one render away rather
  // than waiting out the 300ms debounce above. The rail is already ignored
  // while a search is active (see the skus query), so the hit is reachable
  // whatever category it sits in.
  useDeepLinkQuery((deepQ) => {
    setSearch(deepQ);
    setQ(deepQ);
  });

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : 'عملیات ناموفق بود.');

  const cats = useQuery({ queryKey: ['admin', 'cat', 'categories'], queryFn: adminApi.categories });
  const categories = useMemo(
    () => [...(cats.data?.categories ?? [])].sort((a, b) => a.order - b.order),
    [cats.data],
  );

  // All sub-categories in one request — the rail shows every expanded branch
  // at once, so per-category fetching would fire a request per twisty click.
  const allSubs = useQuery({
    queryKey: ['admin', 'cat', 'subs', 'all'],
    queryFn: () => adminApi.subCategories(),
  });
  const subsByCategory = useMemo(() => {
    const out: Record<string, AdminSubCategory[]> = {};
    for (const x of [...(allSubs.data?.subCategories ?? [])].sort((a, b) => a.order - b.order)) {
      (out[x.categoryId] ??= []).push(x);
    }
    return out;
  }, [allSubs.data]);

  const skus = useQuery({
    queryKey: ['admin', 'cat', 'skus', sel.categoryId, sel.subCategoryId, q, page],
    queryFn: () =>
      adminApi.skus({
        // While searching, ignore the rail: the badge tells the admin the
        // search spans every category, so the request has to actually do it.
        categoryId: q ? undefined : sel.categoryId || undefined,
        subCategoryId: q ? undefined : sel.subCategoryId || undefined,
        q: q || undefined,
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
  // stale selection surviving a filter change could bulk-delete rows the
  // admin can no longer see.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [sel.categoryId, sel.subCategoryId, q]);

  // Paging away strands the selection off-screen, and the bulk bar would then
  // act on rows the admin cannot see.
  useEffect(() => {
    setSelected(new Set());
  }, [page]);

  const removeSku = useMutation({
    mutationFn: (id: string) => adminApi.deleteSku(id),
    onSuccess: () => {
      toast.success('کالا حذف شد.');
      invalidateAll();
    },
    onError,
  });

  /** Deletion states its blast radius first — and it is a real deletion, so
   *  the dialog has to be honest that there is no undo. */
  const askDeleteSku = async (r: AdminSku) => {
    let impact: Awaited<ReturnType<typeof adminApi.skuImpact>> | null = null;
    try {
      impact = await adminApi.skuImpact(r.id);
    } catch {
      // The confirm still has to work if the impact lookup fails.
    }
    const ok = await confirm({
      title: `حذف «${r.name}»`,
      body: (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span>
            صفحهٔ این کالا در سایت دیگر باز نمی‌شود و از جدول قیمت‌ها، جستجو و نقشهٔ سایت حذف
            می‌شود.
          </span>
          {impact && impact.openLeads > 0 ? (
            <span>
              ‏{toPersianDigits(impact.openLeads)} سرنخ باز این کالا را در اقلام دارد —
              پیش‌فاکتورهای صادرشده تغییر نمی‌کنند.
            </span>
          ) : null}
          {impact && impact.openOrders > 0 ? (
            <span>‏{toPersianDigits(impact.openOrders)} سفارش در جریان این کالا را دارد.</span>
          ) : null}
          {impact && (impact.favorites > 0 || impact.activeAlerts > 0) ? (
            <span>
              ‏{toPersianDigits(impact.favorites)} کاربر نشانش کرده‌اند و{' '}
              {toPersianDigits(impact.activeAlerts)} هشدار قیمت رویش فعال است.
            </span>
          ) : null}
          <span>
            تاریخچهٔ قیمت این کالا هم پاک می‌شود. پیش‌فاکتورها و سفارش‌های صادرشده دست نمی‌خورند —
            نام و قیمت را خودشان نگه داشته‌اند. این کار برگشت‌پذیر نیست.
          </span>
        </div>
      ),
      confirmLabel: 'حذف کن',
    });
    if (ok) removeSku.mutate(r.id);
  };

  const askDeleteCategory = async (c: AdminCategory) => {
    const ok = await confirm({
      title: `حذف دستهٔ «${c.name}»`,
      body: (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span>
            این دسته {toPersianDigits(c.subCount)} زیر‌دسته و {toPersianDigits(c.skuCount)} کالا
            دارد.
          </span>
          <span>
            هر {toPersianDigits(c.subCount)} زیر‌دسته و هر {toPersianDigits(c.skuCount)} کالا — با
            تاریخچهٔ قیمتشان — همراه دسته پاک می‌شوند. پیش‌فاکتورها و سفارش‌های صادرشده دست
            نمی‌خورند. این کار برگشت‌پذیر نیست.
          </span>
        </div>
      ),
      confirmLabel: 'حذف کن',
    });
    if (!ok) return;
    try {
      await adminApi.deleteCategory(c.id);
      toast.success('دسته حذف شد.');
      if (sel.categoryId === c.id) setSel({ categoryId: '', subCategoryId: '' });
      invalidateAll();
    } catch (err) {
      onError(err);
    }
  };

  const askDeleteSub = async (x: AdminSubCategory) => {
    const ok = await confirm({
      title: `حذف زیر‌دستهٔ «${x.name}»`,
      body: (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span>این زیر‌دسته {toPersianDigits(x.skuCount)} کالا دارد.</span>
          <span>
            زیر‌دسته و هر {toPersianDigits(x.skuCount)} کالای آن — با تاریخچهٔ قیمتشان — پاک
            می‌شوند. پیش‌فاکتورها و سفارش‌های صادرشده دست نمی‌خورند. این کار برگشت‌پذیر نیست.
          </span>
        </div>
      ),
      confirmLabel: 'حذف کن',
    });
    if (!ok) return;
    try {
      await adminApi.deleteSubCategory(x.id);
      toast.success('زیر‌دسته حذف شد.');
      if (sel.subCategoryId === x.id) setSel({ categoryId: sel.categoryId, subCategoryId: '' });
      invalidateAll();
    } catch (err) {
      onError(err);
    }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: 'حذف گروهی',
      body: `${toPersianDigits(ids.length)} کالا با تاریخچهٔ قیمتشان پاک می‌شوند. این کار برگشت‌پذیر نیست.`,
      confirmLabel: 'حذف کن',
    });
    if (!ok) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => adminApi.deleteSku(id)));
    setBulkBusy(false);
    const failedIds = ids.filter((_id, i) => results[i]!.status === 'rejected');
    if (failedIds.length > 0) {
      // Keep the failures selected so «دوباره تلاش» is one click, instead of
      // reporting a bare count and clearing the selection.
      setSelected(new Set(failedIds));
      toast.error(`${toPersianDigits(failedIds.length)} کالا حذف نشد؛ همان‌ها انتخاب مانده‌اند.`);
    } else {
      setSelected(new Set());
      toast.success(`${toPersianDigits(ids.length)} کالا حذف شد.`);
    }
    invalidateAll();
  };

  /** Reorder writes the whole neighbourhood in one go and always refetches,
   *  so a partial failure can't leave the rail rendering numbers the DB no
   *  longer has. */
  const move = async (
    list: Array<{ id: string; order: number }>,
    id: string,
    dir: -1 | 1,
    kind: 'category' | 'sub',
  ) => {
    // Addressed by id, not index: the rail renders a filtered list when
    // «نمایش غیرفعال‌ها» is off, so an index into what the admin SEES would
    // move the wrong row here.
    const index = list.findIndex((x) => x.id === id);
    if (index < 0) return;
    // Every row in the rail is a row on the site, so the neighbour is simply
    // the next one — the old walk past hidden rows has nothing left to skip.
    const target = index + dir;
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

  const selectedCategory = categories.find((c) => c.id === sel.categoryId) ?? null;

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
        busy={reordering}
        onNewCategory={() => setNodeDraft({ kind: 'category', row: null })}
        onNewSub={(categoryId) => setNodeDraft({ kind: 'sub', row: null, categoryId })}
        onEditCategory={(c) => setNodeDraft({ kind: 'category', row: c })}
        onEditSub={(x) => setNodeDraft({ kind: 'sub', row: x, categoryId: x.categoryId })}
        onDeleteCategory={(c) => void askDeleteCategory(c)}
        onDeleteSub={(x) => void askDeleteSub(x)}
        onMoveCategory={(id, dir) => void move(categories, id, dir, 'category')}
        // Reorder in the order the rail SHOWS, not in raw array order. The
        // rail renders `groupByLabel` clusters, so once a category carries
        // group labels the flat neighbour is usually in a different cluster:
        // swapping ورق's «اسیدشویی» with «گالوانیزه» leaves both clusters'
        // first members and internal sequences unchanged, i.e. the rail is
        // byte-identical afterwards and the admin presses the button watching
        // nothing happen. `move` renumbers `order` over the list it is given,
        // and re-grouping a display-ordered list reproduces the same display
        // order, so this is stable rather than fighting the grouping.
        onMoveSub={(categoryId, subId, dir) =>
          void move(displayOrder(subsByCategory[categoryId] ?? []), subId, dir, 'sub')
        }
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

        {/* Factory display order for the selected category (US-18.2). Lives
            here rather than in the rail because factories are not a taxonomy
            node — there is nothing to expand, select or file products under,
            and a category can carry eighteen of them. Collapsed by default so
            it costs the product index one line; hidden entirely under «همهٔ
            کالاها», where "which category's factories?" has no answer. A
            sub-category selection still shows it: the order is per CATEGORY,
            and that is what the header says. */}
        {selectedCategory ? (
          <FactoryOrderPanel
            categoryId={selectedCategory.id}
            categoryName={selectedCategory.name}
          />
        ) : null}

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
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => setSelected(new Set())}
              >
                لغو انتخاب
              </Button>
              <Button size="sm" loading={bulkBusy} onClick={() => void bulkDelete()}>
                حذف {toPersianDigits(selected.size)} کالا
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
            body={q ? 'در هیچ دسته‌ای چنین کالایی نیست.' : 'با «کالای جدید» اضافه کنید.'}
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
                          setSelected(
                            e.target.checked ? new Set(rows.map((r) => r.sku.id)) : new Set(),
                          )
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
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                        >
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
                      <td className="tnum">{r.size ? toPersianDigits(r.size) : '—'}</td>
                      <td>{r.factory ?? '—'}</td>
                      <td>{r.grade ?? r.standard ?? '—'}</td>
                      <td>{UNIT_LABEL[r.unit] ?? r.unit}</td>
                      <td className="tnum">
                        {price ? `${formatToman(price.price, false)} تومان` : '—'}
                      </td>
                      <td>
                        {/* There is no «فعال»/«غیرفعال» to report any more —
                            the row is in the panel, therefore it is on the
                            site. The one status a product can still be in
                            that a customer notices is «بدون قیمت». */}
                        {price ? (
                          <Badge tone="gain">روی سایت</Badge>
                        ) : (
                          <Badge tone="stale">بدون قیمت</Badge>
                        )}
                      </td>
                      <td>
                        <span style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          <Button size="sm" variant="ghost" onClick={() => setDrawer({ sku: r })}>
                            ویرایش
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void askDeleteSku(r)}>
                            حذف
                          </Button>
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
  // The category's public one-liner, out of and back into `seo.description`.
  const [description, setDescription] = useState(iconRow?.seo?.description ?? '');
  const subRow = draft.kind === 'sub' ? (draft.row as AdminSubCategory | null) : null;
  const [groupLabel, setGroupLabel] = useState(subRow?.groupLabel ?? '');

  // Existing group labels within the selected parent category — same "pick,
  // don't retype" rationale as SkuDrawer's factory/size/grade pickers: a
  // free-text cluster key is only useful if «ورق رنگی» stays one string, not
  // silently-splitting near-duplicates.
  const { data: suggestions } = useQuery({
    queryKey: ['admin', 'cat', 'suggestions', draft.kind === 'sub' ? categoryId : ''],
    queryFn: () => adminApi.catalogSuggestions(categoryId),
    enabled: draft.kind === 'sub' && Boolean(categoryId),
    staleTime: 5 * 60 * 1000,
  });

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

  const save = useMutation({
    // The two branches return differently-shaped payloads and neither is used
    // — the caller just refetches — so the result is deliberately widened.
    mutationFn: async (): Promise<void> => {
      if (draft.kind === 'category') {
        // The rest of the blob is preserved: `seo` is replaced wholesale by
        // the API, so sending only `{ description }` would silently drop a
        // canonical or an OG image someone had set on this category.
        const trimmed = description.trim();
        const seo = { ...(iconRow?.seo ?? {}), description: trimmed || undefined };
        // …and an otherwise-empty blob is stored as NULL rather than as `{}`,
        // so «no SEO set» stays one state in the column instead of two.
        const seoValue = Object.values(seo).some((x) => x !== undefined) ? seo : null;
        if (draft.row)
          await adminApi.updateCategory(draft.row.id, {
            name,
            slug,
            iconId,
            imageUrl,
            seo: seoValue,
          });
        else await adminApi.createCategory({ name, slug, iconId, imageUrl, seo: seoValue });
        return;
      }
      if (draft.row)
        await adminApi.updateSubCategory(draft.row.id, { name, slug, categoryId, groupLabel });
      else await adminApi.createSubCategory({ categoryId, name, slug, groupLabel });
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

        {draft.kind === 'sub' ? (
          <PickerInput
            id="node-group"
            label="گروه نمایشی (اختیاری)"
            helper={
              'برای دسته‌بندی چند زیر‌دسته زیر یک سرتیتر مشترک، مثلاً «ورق رنگی داخلی» و «ورق رنگی خارجی» ' +
              'هر دو گروه «ورق رنگی» — این یک زیر‌دستهٔ واقعی نمی‌سازد، فقط ظاهر منو و پنل را گروه می‌کند.'
            }
            value={groupLabel}
            options={suggestions?.groupLabels ?? []}
            error={fieldErrors.groupLabel}
            maxLength={80}
            onChange={setGroupLabel}
          />
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
            {/* One or two lines saying what this دسته is and who buys it.
                Shown in the mega‌منو زیر نام دسته and published as the
                category's `description` in the site's structured data, which
                is what an answer engine reads when someone asks what آهن‌تایم
                sells. Kept short on purpose — the menu clamps it to one line. */}
            <Textarea
              label="توضیح کوتاه دسته"
              rows={3}
              maxLength={200}
              helper={`در مگا‌منو زیر نام دسته و در دادهٔ ساختاریافتهٔ صفحه منتشر می‌شود. بگویید این دسته چیست و به چه کاری می‌آید. ${toPersianDigits(description.trim().length)} از ${toPersianDigits(200)} نویسه.`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </>
        ) : null}

        <div>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={advanced}
            onClick={() => setAdvanced((x) => !x)}
          >
            {advanced ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
          </Button>
          {advanced ? (
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              {isEdit ? (
                <Alert tone="warning">
                  نشانی فعلی در گوگل ثبت شده؛ با تغییر آن انتقال خودکار از نشانی قدیمی ساخته می‌شود
                  تا لینک‌های قبلی نشکنند.
                </Alert>
              ) : null}
              <TextInput
                label="نشانی صفحه"
                dir="ltr"
                helper="خودکار از روی نام ساخته می‌شود؛ فقط اگر دلیل خاصی دارید تغییرش دهید."
                value={slug}
                error={
                  fieldErrors.slug ??
                  (slug && !slugValid ? 'فقط حروف کوچک انگلیسی، عدد و خط تیره.' : undefined)
                }
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
