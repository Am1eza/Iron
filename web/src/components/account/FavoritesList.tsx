'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { routes } from '@/lib/routes';
import { http } from '@/lib/api/http';
import { useToast } from '@/lib/hooks/useToast';
import type { PriceRow } from '@/lib/types/domain';
import { formatToman, priceHiddenLabel } from '@/lib/utils/format';
import { Button, EmptyState, emptyPresets, MovementBadge } from '@/components/ui';
import styles from './RequestsList.module.css';

/**
 * Live favorites — starred SKUs as price rows with quick links + remove.
 * `r.name` stays fa: the favorites API returns bare price rows, not the
 * category/sub-category entities `getLocalizedSkuName` needs to compose a
 * translated name (see `@/lib/utils/localizedNames`) — out of scope here.
 */
export function FavoritesList() {
  const t = useTranslations('account.favorites');
  const tUnit = useTranslations('common.unit');
  const tEmpty = useTranslations('emptyPresets');
  const tAction = useTranslations('common.action');
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.myFavorites(),
    queryFn: () => http.get<{ favorites: PriceRow[] }>('/api/me/favorites'),
  });
  const remove = useMutation({
    mutationFn: (skuId: string) => http.del(`/api/me/favorites/${encodeURIComponent(skuId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.myFavorites() });
      toast.success(t('removedToast'));
    },
  });

  if (isLoading) return <p style={{ color: 'var(--color-text-muted)' }}>{t('loading')}</p>;
  const favorites = data?.favorites ?? [];
  if (favorites.length === 0) {
    return <EmptyState size="section" {...emptyPresets.favoritesEmpty(tEmpty, tAction)} />;
  }

  return (
    <ul className={styles.list}>
      {favorites.map((r) => (
        <li key={r.id} className={styles.item}>
          <div>
            <Link href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}>{r.name}</Link>
            <p className={`tnum`} style={{ color: 'var(--color-text-muted)', font: 'var(--t-body-sm)' }}>
              {priceHiddenLabel(r.current) ?? `${formatToman(r.current.price, false)} ${tUnit('currency')}`}{' '}
              {!priceHiddenLabel(r.current) && r.current.movementPct != null ? (
                <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
              ) : null}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove.mutate(r.slug)} disabled={remove.isPending}>
            {t('remove')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
