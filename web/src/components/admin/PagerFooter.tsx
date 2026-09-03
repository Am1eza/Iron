'use client';
/** Shared prev/next pager for admin lists (US-19.2) — client-state driven
 *  (page number in useState, not the URL), unlike the public site's
 *  Link-based <Pagination>, which doesn't fit useQuery-driven admin tables. */
import { Button } from '@/components/ui';
import { toPersianDigits } from '@/lib/utils/format';
import ui from './adminUi.module.css';

export function PagerFooter({
  page,
  perPage,
  total,
  onPage,
  perPageOptions,
  onPerPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  /**
   * Page sizes to offer. Opt-in: pass this together with `onPerPage` and the
   * pager grows a size selector plus first/last jumps; leave both off and it
   * behaves exactly as it always has, which is what the other admin lists
   * rely on.
   *
   * The catalog is the list that needed it — 748 products at a hard-coded 50
   * is fifteen pages the admin can only walk one click at a time, and the
   * server has accepted `perPage` up to 200 the whole time (the client simply
   * never sent it).
   */
  perPageOptions?: readonly number[];
  /** Callers must reset to page 1: the row that was on page 12 of 15 is on no
   *  particular page once the size changes. */
  onPerPage?: (perPage: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const sizable = perPageOptions !== undefined && onPerPage !== undefined;
  // Without the selector there is nothing to say about a single page. With it
  // there is: raising the size to 200 collapses the list to one page, and a
  // control that disappears at exactly that moment is a control that cannot
  // be undone.
  if (pageCount <= 1 && !sizable) return null;
  return (
    <div className={ui.toolbar}>
      {sizable ? (
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(1)}>
          نخستین
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        قبلی
      </Button>
      <span className={ui.muted}>
        صفحهٔ {toPersianDigits(page)} از {toPersianDigits(pageCount)}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        بعدی
      </Button>
      {sizable ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= pageCount}
            onClick={() => onPage(pageCount)}
          >
            آخرین
          </Button>
          <span className={ui.muted}>{toPersianDigits(total)} ردیف</span>
          <select
            className={ui.select}
            aria-label="تعداد ردیف در هر صفحه"
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {toPersianDigits(n)} در صفحه
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}
