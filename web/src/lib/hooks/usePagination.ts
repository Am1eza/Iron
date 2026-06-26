'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-synced pagination. The page lives in `?page=` so it's shareable, restorable
 * on back/forward, and crawlable. Pairs with the <Pagination> component's `hrefFor`.
 */
export function usePagination(opts?: { param?: string; pageCount?: number }) {
  const param = opts?.param ?? 'page';
  const pageCount = opts?.pageCount;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = useMemo(() => {
    const raw = Number(searchParams.get(param));
    const p = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
    return pageCount ? Math.min(p, pageCount) : p;
  }, [searchParams, param, pageCount]);

  /** Build a URL for a given page (page 1 omits the param → clean canonical). */
  const hrefFor = useCallback(
    (p: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (p <= 1) next.delete(param);
      else next.set(param, String(p));
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [searchParams, pathname, param],
  );

  const setPage = useCallback(
    (p: number, options?: { scroll?: boolean }) => {
      router.push(hrefFor(p), { scroll: options?.scroll ?? true });
    },
    [router, hrefFor],
  );

  return { page, setPage, hrefFor };
}
