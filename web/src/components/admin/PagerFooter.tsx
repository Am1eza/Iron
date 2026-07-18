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
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  if (pageCount <= 1) return null;
  return (
    <div className={ui.toolbar}>
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        قبلی
      </Button>
      <span className={ui.muted}>
        صفحهٔ {toPersianDigits(page)} از {toPersianDigits(pageCount)}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        بعدی
      </Button>
    </div>
  );
}
