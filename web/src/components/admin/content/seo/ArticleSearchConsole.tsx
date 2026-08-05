'use client';
/**
 * "What is this page actually ranking for?" — cached Google Search Console
 * rows for one article (US-14.4).
 *
 * SHIPS HIDDEN. The server has no Google Cloud OAuth client yet (only the
 * owner can create one), so `status.configured` is false and this component
 * renders NOTHING — not an empty table, not a "connect" call-to-action a
 * content editor has no permission to act on. The moment the credentials
 * exist and someone with `settings:write` connects on /admin/seo, the same
 * component starts rendering real rows with no other change.
 *
 * It never triggers a live Google call on open: the daily job fills the cache
 * and this reads it. «به‌روزرسانی» is the deliberate exception, and it is
 * rate-limited server-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { useToast } from '@/lib/hooks/useToast';
import { Button } from '@/components/ui';
import { formatJalali } from '@/lib/utils/jalali';
import ui from '../../adminUi.module.css';
import s from './seoPanel.module.css';

const fa = new Intl.NumberFormat('fa-IR');
const faPct = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function ArticleSearchConsole({
  path,
  published,
  className,
}: {
  path: string | null;
  published: boolean;
  /** Card chrome from the parent — see the call site in ContentQueue for why
   *  the wrapper is passed in rather than wrapped around. */
  className?: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  // A draft has no public URL, so Search Console has nothing to say about it —
  // asking would spend a request to be told "no rows".
  const enabled = Boolean(path) && published;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'search-console', path],
    queryFn: () => adminApi.searchConsoleMetrics(path!),
    enabled,
  });

  const refresh = useMutation({
    mutationFn: () => adminApi.refreshSearchConsoleMetrics(path!),
    onSuccess: () => {
      toast.success('داده‌های سرچ کنسول به‌روز شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'search-console', path] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  // A failed status fetch renders nothing rather than an error box: this
  // panel is additive information about a page, and the article editor is not
  // the place to surface a Search Console outage. The connection screen on
  // /admin/seo is, and it does.
  if (!enabled || isLoading) return null;
  const status = data?.status;
  // Unconfigured OR unconnected → render nothing at all. See the file header.
  if (!status?.configured || !status.connected) return null;

  const rows = data?.metrics?.rows ?? [];
  const fetchedAt = data?.metrics?.fetchedAt;

  return (
    <div className={className}>
      <div className={s.summary}>
        <span className={ui.tileLabel}>عملکرد این صفحه در گوگل</span>
        {/* The button gets a POSITIONING class only. Passing the caption
            class through `className` made an action render as muted grey
            caption text — and which of the two single-class rules won came
            down to stylesheet order, not intent. */}
        <span className={s.summaryCounts}>
          <Button size="sm" variant="ghost" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            به‌روزرسانی
          </Button>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className={ui.tileHint}>
          گوگل هنوز برای این صفحه داده‌ای ثبت نکرده است. برای صفحه‌ای که تازه منتشر شده طبیعی است — داده‌های سرچ
          کنسول دو تا سه روز تأخیر دارند.
        </div>
      ) : (
        <table className={s.metricsTable}>
          <caption className="visually-hidden">
            عبارت‌هایی که کاربران جستجو کرده‌اند و این صفحه در نتیجه‌شان دیده شده است
          </caption>
          <thead>
            <tr>
              <th scope="col" className={s.queryCell}>
                عبارت جستجو
              </th>
              <th scope="col" className={s.numCell}>
                کلیک
              </th>
              <th scope="col" className={s.numCell}>
                نمایش
              </th>
              <th scope="col" className={s.numCell}>
                میانگین جایگاه
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.query}>
                <td className={s.queryCell}>{r.query}</td>
                <td className={`${s.numCell} tnum`}>{fa.format(Math.round(r.clicks))}</td>
                <td className={`${s.numCell} tnum`}>{fa.format(Math.round(r.impressions))}</td>
                {/* Position is fractional and MUST stay so — «۴٫۷» and «۵» are
                    different answers to "am I on page one?". */}
                <td className={`${s.numCell} tnum`}>{faPct.format(r.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {fetchedAt ? <div className={s.asOf}>آخرین به‌روزرسانی: {formatJalali(new Date(fetchedAt))}</div> : null}
      {/* Not colour alone: a glyph and a visually-hidden «خطا» carry the same
          signal for anyone who cannot see the red. */}
      {status.lastError ? (
        <p className={s.errorLine}>
          <span aria-hidden="true">⚠</span>
          <span>
            <span className="visually-hidden">خطا: </span>
            {status.lastError}
          </span>
        </p>
      ) : null}
    </div>
  );
}
