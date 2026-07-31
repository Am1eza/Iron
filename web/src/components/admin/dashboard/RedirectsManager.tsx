'use client';
/**
 * «هدایت‌های آدرس» — general visibility and control over the ONE `redirects`
 * table the whole app writes to, not just the ones created from an article's
 * own "redirect this page elsewhere" widget (ContentQueue.tsx). Renaming a
 * category or sub-category (`catalogRoute.ts`'s `redirectOnSlugChange`) and
 * renaming a published article's slug both write into this exact same table
 * automatically — and until this component existed, there was no admin page
 * anywhere that listed any of it. An admin could have a redirect quietly
 * sending a real visitor somewhere unexpected with no way to discover why,
 * short of asking an engineer to query the database directly.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AdminRedirect } from '@/lib/api/resources/admin';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, EmptyState, Heading, TableSkeleton, Text, useConfirm } from '@/components/ui';
import ui from '../adminUi.module.css';

export function RedirectsManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'redirects'],
    queryFn: () => adminApi.redirects(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'redirects'] });

  const create = useMutation({
    mutationFn: () => adminApi.createRedirect({ fromPath: fromPath.trim(), toPath: toPath.trim(), permanent }),
    onSuccess: () => {
      toast.success('هدایت ساخته شد؛ تا حدود یک دقیقه روی سایت اعمال می‌شود.');
      setFromPath('');
      setToPath('');
      setPermanent(true);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ساخت هدایت ناموفق بود.'),
  });

  const updateTarget = useMutation({
    mutationFn: (v: { id: string; toPath: string }) => adminApi.updateRedirect(v.id, { toPath: v.toPath }),
    onSuccess: () => {
      toast.success('مقصد به‌روزرسانی شد.');
      setEditingId(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  const updatePermanent = useMutation({
    mutationFn: (v: { id: string; permanent: boolean }) => adminApi.updateRedirect(v.id, { permanent: v.permanent }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteRedirect(id),
    onSuccess: () => {
      toast.success('هدایت حذف شد.');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'حذف ناموفق بود.'),
  });

  const redirects = data?.redirects;
  const all = useMemo(() => redirects ?? [], [redirects]);
  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return all;
    return all.filter((r) => r.fromPath.includes(needle) || r.toPath.includes(needle));
  }, [all, q]);

  const startEdit = (r: AdminRedirect) => {
    setEditingId(r.id);
    setEditTarget(r.toPath);
  };

  return (
    <section className={ui.panel} aria-labelledby="redirects-heading">
      <Heading level={2} id="redirects-heading">
        هدایت‌های آدرس (Redirect)
      </Heading>
      <Text color="muted">
        هر آدرسی که اینجا اضافه شود، بازدیدکنندهٔ آن به‌طور خودکار به مقصد فرستاده می‌شود — چه همین‌جا دستی ساخته شود،
        چه هنگام تغییر نشانی یک مقاله یا دسته‌بندی خودکار ساخته شده باشد؛ همهٔ آن‌ها در همین یک فهرست‌اند. اعمال‌شدن
        یک تغییر روی سایت تا حدود یک دقیقه طول می‌کشد.
      </Text>

      <form
        className={ui.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          if (!create.isPending && fromPath.trim() && toPath.trim()) create.mutate();
        }}
      >
        <label htmlFor="redirect-from" className="visually-hidden">
          آدرس مبدأ
        </label>
        <input
          id="redirect-from"
          className={ui.textCell}
          style={{ inlineSize: '14rem', direction: 'ltr', textAlign: 'end' }}
          placeholder="/از-این-آدرس"
          value={fromPath}
          maxLength={500}
          onChange={(e) => setFromPath(e.target.value)}
        />
        <label htmlFor="redirect-to" className="visually-hidden">
          آدرس مقصد
        </label>
        <input
          id="redirect-to"
          className={ui.textCell}
          style={{ inlineSize: '14rem', direction: 'ltr', textAlign: 'end' }}
          placeholder="/به-این-آدرس"
          value={toPath}
          maxLength={500}
          onChange={(e) => setToPath(e.target.value)}
        />
        <label htmlFor="redirect-permanent" className="visually-hidden">
          نوع هدایت
        </label>
        <select
          id="redirect-permanent"
          className={ui.textCell}
          value={permanent ? '1' : '0'}
          onChange={(e) => setPermanent(e.target.value === '1')}
        >
          <option value="1">دائمی (۳۰۱)</option>
          <option value="0">موقت (۳۰۲)</option>
        </select>
        <Button type="submit" size="sm" loading={create.isPending} disabled={!fromPath.trim() || !toPath.trim()}>
          افزودن هدایت
        </Button>
      </form>

      {all.length > 0 ? (
        <input
          type="search"
          className={ui.textCell}
          style={{ inlineSize: '100%', maxInlineSize: '24rem' }}
          placeholder="جستجو در آدرس مبدأ یا مقصد…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="جستجوی هدایت"
        />
      ) : null}

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="خطا در دریافت فهرست"
          primary={{ label: 'تلاش دوباره', onClick: () => refetch() }}
        />
      ) : all.length === 0 ? (
        <EmptyState size="section" headline="هنوز هیچ هدایتی ثبت نشده" body="با فرم بالا اولین مورد را اضافه کنید." />
      ) : filtered.length === 0 ? (
        <EmptyState size="inline" headline={`چیزی با «${q}» پیدا نشد`} />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <caption className="visually-hidden">فهرست هدایت‌های آدرس</caption>
            <thead>
              <tr>
                <th scope="col">مبدأ</th>
                <th scope="col">مقصد</th>
                <th scope="col">نوع</th>
                <th scope="col">تاریخ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className={ui.mono} style={{ direction: 'ltr', textAlign: 'right' }}>
                    {r.fromPath}
                  </td>
                  <td>
                    {editingId === r.id ? (
                      <span className={ui.rowActions}>
                        <input
                          className={ui.textCell}
                          style={{ inlineSize: '12rem', direction: 'ltr', textAlign: 'end' }}
                          value={editTarget}
                          maxLength={500}
                          autoFocus
                          onChange={(e) => setEditTarget(e.target.value)}
                        />
                        <Button
                          size="sm"
                          loading={updateTarget.isPending}
                          disabled={!editTarget.trim()}
                          onClick={() => updateTarget.mutate({ id: r.id, toPath: editTarget.trim() })}
                        >
                          ذخیره
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          انصراف
                        </Button>
                      </span>
                    ) : (
                      <span className={ui.rowActions}>
                        <span className={ui.mono} style={{ direction: 'ltr' }}>
                          {r.toPath}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                          ویرایش
                        </Button>
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      className={ui.textCell}
                      aria-label={`نوع هدایت ${r.fromPath}`}
                      value={r.permanent ? '1' : '0'}
                      disabled={updatePermanent.isPending}
                      onChange={(e) => updatePermanent.mutate({ id: r.id, permanent: e.target.value === '1' })}
                    >
                      <option value="1">دائمی (۳۰۱)</option>
                      <option value="0">موقت (۳۰۲)</option>
                    </select>
                  </td>
                  <td className={ui.muted}>{formatJalali(r.createdAt)}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void confirm({
                          title: 'حذف این هدایت؟',
                          body: `از این پس «${r.fromPath}» دیگر بازدیدکننده را به «${r.toPath}» نمی‌فرستد.`,
                          confirmLabel: 'حذف',
                        }).then((ok) => {
                          if (ok) remove.mutate(r.id);
                        })
                      }
                    >
                      حذف
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </section>
  );
}
