'use client';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { routes } from '@/lib/routes';
import { http } from '@/lib/api/http';
import type { PriceRow } from '@/lib/types/domain';
import { formatToman } from '@/lib/utils/format';
import { Button, EmptyState, emptyPresets, MovementBadge } from '@/components/ui';
import styles from './RequestsList.module.css';

/** Live favorites — starred SKUs as price rows with quick links + remove. */
export function FavoritesList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.myFavorites(),
    queryFn: () => http.get<{ favorites: PriceRow[] }>('/api/me/favorites'),
  });
  const remove = useMutation({
    mutationFn: (skuId: string) => http.del(`/api/me/favorites/${encodeURIComponent(skuId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.myFavorites() }),
  });

  if (isLoading) return <p style={{ color: 'var(--color-text-muted)' }}>در حال بارگذاری…</p>;
  const favorites = data?.favorites ?? [];
  if (favorites.length === 0) {
    return <EmptyState size="section" {...emptyPresets.favoritesEmpty()} />;
  }

  return (
    <ul className={styles.list}>
      {favorites.map((r) => (
        <li key={r.id} className={styles.item}>
          <div>
            <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}>{r.name}</Link>
            <p className={`tnum`} style={{ color: 'var(--color-text-muted)', font: 'var(--t-body-sm)' }}>
              {r.current.priceHidden ? 'تماس بگیرید' : `${formatToman(r.current.price, false)} تومان`}{' '}
              {!r.current.priceHidden && r.current.movementPct != null ? (
                <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
              ) : null}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove.mutate(r.slug)} disabled={remove.isPending}>
            حذف
          </Button>
        </li>
      ))}
    </ul>
  );
}
