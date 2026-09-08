import { PaginationClient } from './PaginationClient';

/**
 * D9 · Pagination — numbered pager «‹ ۱ ۲ ۳ ›» (arrows mirror for RTL). `hrefFor`
 * builds each page URL so it stays a real, crawlable link (rel prev/next set by page).
 *
 * Stays a plain Server Component specifically so `hrefFor` — a function —
 * can be called here, server-side, rather than crossing into a Client
 * Component. React/Next.js forbids passing a function prop across that
 * boundary ("Functions cannot be passed directly to Client Components")
 * and enforces it at PRERENDER time, not just in dev — this only surfaced
 * when `PaginationClient` (needed so page numbers and prev/next labels can
 * react to a locale switch, see that file's header comment) was briefly
 * merged as `Pagination` itself with `'use client'`, which broke every
 * Server Component caller passing a `hrefFor` closure (e.g. `/news`) at
 * static-export build time. Resolving every href here, into plain strings,
 * before handing off to the client half keeps both requirements satisfied.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (p: number) => string;
}) {
  if (pageCount <= 1) return null;
  const pages = windowed(page, pageCount);

  return (
    <PaginationClient
      page={page}
      prevHref={page > 1 ? hrefFor(page - 1) : undefined}
      nextHref={page < pageCount ? hrefFor(page + 1) : undefined}
      pages={pages.map((p) => (p === '…' ? '…' : { value: p, href: hrefFor(p) }))}
    />
  );
}

/** Build a compact page window with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function windowed(page: number, count: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const push = (n: number) => out.push(n);
  const lo = Math.max(2, page - 1);
  const hi = Math.min(count - 1, page + 1);
  push(1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) push(p);
  if (hi < count - 1) out.push('…');
  if (count > 1) push(count);
  return out;
}
