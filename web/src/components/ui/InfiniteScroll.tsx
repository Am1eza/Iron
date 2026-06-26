'use client';
import { useEffect, type ReactNode } from 'react';
import { useIntersectionObserver } from '@/lib/hooks/useIntersectionObserver';
import { Spinner } from './Spinner';
import { Button } from '@/components/primitives/Button';
import styles from './InfiniteScroll.module.css';

/**
 * Infinite scroll — wraps a list and auto-loads the next page when a sentinel
 * scrolls into view (pairs with TanStack `useInfiniteQuery`). Degrades to a
 * «نمایش بیشتر» button (manual control + keyboard + reduced-motion friendly).
 * Loads ahead via `rootMargin` so content arrives before the user hits the end.
 */
export function InfiniteScroll({
  children,
  hasMore,
  isLoading,
  onLoadMore,
  endLabel = 'پایان فهرست',
  manual = false,
}: {
  children: ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  endLabel?: string;
  manual?: boolean;
}) {
  const { ref, isIntersecting } = useIntersectionObserver({
    rootMargin: '300px 0px',
    enabled: !manual && hasMore && !isLoading,
  });

  useEffect(() => {
    if (isIntersecting && hasMore && !isLoading && !manual) onLoadMore();
  }, [isIntersecting, hasMore, isLoading, manual, onLoadMore]);

  return (
    <>
      {children}
      <div className={styles.foot} aria-live="polite">
        {isLoading ? (
          <span className={styles.loading}>
            <Spinner size={20} />
            در حال بارگذاری…
          </span>
        ) : hasMore ? (
          manual ? (
            <Button variant="ghost" onClick={onLoadMore}>
              نمایش بیشتر
            </Button>
          ) : (
            <div ref={ref} className={styles.sentinel} aria-hidden="true" />
          )
        ) : (
          <span className={styles.end}>{endLabel}</span>
        )}
      </div>
    </>
  );
}
