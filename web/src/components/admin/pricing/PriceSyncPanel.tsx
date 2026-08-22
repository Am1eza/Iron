'use client';
/**
 * «به‌روزرسانی خودکار قیمت» — the admin view of the automated price mirror
 * (US-02.5).
 *
 * The owner chose to run the mirror straight against live prices with no
 * approval step, on the understanding that he would catch mistakes himself.
 * This page is the whole of "catch it yourself": what the last pass wrote,
 * from which competitor row, and a one-click «دستی نگه‌دار» that takes a SKU
 * out of the job's hands from the very next run — so spotting a wrong number
 * and stopping it happen in the same place rather than in two screens.
 *
 * Skips are shown too (behind a filter, not by default) because "why didn't
 * this category update?" is the other half of the same question.
 */
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type PriceSyncEntry, type PriceSyncRun } from '@/lib/api/resources/admin';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, Button, Chip, EmptyState, Stack, TableSkeleton, Text } from '@/components/ui';
import ui from '../adminUi.module.css';
import styles from './priceSync.module.css';

/**
 * The stable machine codes in `price_sync_entries.reason`, rendered. The
 * mapping lives in the UI on purpose: history stores the code, so the Persian
 * can be reworded without rewriting rows that were already written.
 */
const REASON_LABEL: Record<string, string> = {
  'write:exact': 'ثبت شد — کارخانه و سایز دقیقاً مطابق',
  'skip:manual-override': 'دستی نگه داشته شده',
  'skip:no-source-mapping': 'این زیرشاخه در منبع پوشش ندارد',
  'skip:sku-not-per-kg': 'قیمت این کالا کیلوگرمی نیست',
  'skip:sku-has-no-factory': 'کارخانهٔ این کالا ثبت نشده',
  'skip:no-size-match': 'سایز مطابقی در منبع پیدا نشد',
  'skip:source-not-per-kg': 'قیمت منبع شاخه‌ای است، نه کیلوگرمی',
  'skip:low-confidence-match': 'تطبیق کارخانه قطعی نبود',
  'skip:ambiguous-candidates': 'چند ردیف هم‌سطح با قیمت‌های متفاوت',
  'skip:price-out-of-band': 'قیمت خارج از بازهٔ منطقی',
  'skip:source-row-stale': 'خودِ قیمت منبع قدیمی است',
  'skip:write-failed': 'ثبت قیمت ناموفق بود',
};

const OUTCOME_TABS: Array<{ id: '' | 'written' | 'skipped'; label: string }> = [
  { id: 'written', label: 'ثبت‌شده' },
  { id: 'skipped', label: 'رد‌شده' },
  { id: '', label: 'همه' },
];

const SOURCE_LABEL: Record<string, string> = { ahanonline: 'آهن‌آنلاین' };

function changePct(entry: PriceSyncEntry): number | null {
  if (entry.outcome !== 'written' || !entry.oldPrice || !entry.newPrice) return null;
  return Math.round(((entry.newPrice - entry.oldPrice) / entry.oldPrice) * 1000) / 10;
}

function runHeadline(run: PriceSyncRun | undefined): string {
  if (!run) return 'هنوز اجرا نشده';
  if (run.status === 'running') return 'در حال اجرا…';
  if (run.status === 'failed') return 'ناموفق';
  return formatJalali(run.startedAt, 'yyyy/MM/dd — HH:mm');
}

export function PriceSyncPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<'' | 'written' | 'skipped'>('written');
  const [cat, setCat] = useState('');

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['admin', 'priceSync', outcome, cat],
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        adminApi.priceSync.log({
          outcome: outcome || undefined,
          cat: cat || undefined,
          cursor: pageParam,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

  const excluded = useQuery({
    queryKey: ['admin', 'priceSync', 'exclusions'],
    queryFn: () => adminApi.priceSync.exclusions(),
  });

  const first = data?.pages[0];
  const entries = data?.pages.flatMap((p) => p.entries) ?? [];
  const latest = first?.runs[0];
  const categories = [...new Map((first?.scope ?? []).map((s) => [s.categorySlug, s])).values()];
  const excludedSkus = excluded.data?.skus ?? [];

  const toggle = useMutation({
    mutationFn: ({ skuId, next }: { skuId: string; next: boolean }) =>
      adminApi.priceSync.setExcluded(skuId, next),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.next
          ? 'از این پس قیمت این کالا خودکار به‌روزرسانی نمی‌شود.'
          : 'به‌روزرسانی خودکار این کالا دوباره فعال شد.',
      );
      void qc.invalidateQueries({ queryKey: ['admin', 'priceSync'] });
    },
    onError: () => toast.error('تغییر وضعیت ناموفق بود.'),
  });

  const runNow = useMutation({
    mutationFn: () => adminApi.priceSync.runNow(),
    onSuccess: () => {
      toast.success('اجرا آغاز شد. چند دقیقه طول می‌کشد؛ کمی بعد صفحه را تازه کنید.');
      void qc.invalidateQueries({ queryKey: ['admin', 'priceSync'] });
    },
    onError: () => toast.error('شروع اجرا ناموفق بود.'),
  });

  return (
    <Stack gap={5}>
      <div className={ui.tiles}>
        <div className={ui.tile}>
          <p className={`${ui.tileValue} tnum`}>{runHeadline(latest)}</p>
          <p className={ui.tileLabel}>آخرین اجرا</p>
          <p className={ui.tileHint}>
            {latest
              ? latest.trigger === 'manual'
                ? 'دستی'
                : 'زمان‌بندی‌شده'
              : 'زمان‌بندی: ۸:۰۰ و ۱۲:۰۰ به وقت تهران'}
          </p>
        </div>
        <div className={`${ui.tile} ${ui.tileGood}`}>
          <p className={`${ui.tileValue} tnum`}>{toPersianDigits(latest?.written ?? 0)}</p>
          <p className={ui.tileLabel}>قیمت ثبت‌شده در آخرین اجرا</p>
        </div>
        <div className={ui.tile}>
          <p className={`${ui.tileValue} tnum`}>{toPersianDigits(latest?.skipped ?? 0)}</p>
          <p className={ui.tileLabel}>رد‌شده</p>
          <p className={ui.tileHint}>با ذکر دلیل، در جدول زیر</p>
        </div>
        <div className={ui.tile}>
          <p className={`${ui.tileValue} tnum`}>{toPersianDigits(excludedSkus.length)}</p>
          <p className={ui.tileLabel}>کالای دستی‌نگه‌داشته‌شده</p>
        </div>
      </div>

      {latest?.error ? (
        <div className={styles.notice}>
          <Text variant="body-sm">اجرای آخر با هشدار تمام شد: {latest.error}</Text>
        </div>
      ) : null}

      {first && !first.config.enabled ? (
        <div className={styles.notice}>
          <Text variant="body-sm">
            به‌روزرسانی خودکار از طریق تنظیمات خاموش شده است؛ اجرای زمان‌بندی‌شده انجام نمی‌شود.
          </Text>
        </div>
      ) : null}

      <div className={ui.toolbar}>
        {OUTCOME_TABS.map((t) => (
          <Chip key={t.id} selected={outcome === t.id} onClick={() => setOutcome(t.id)}>
            {t.label}
          </Chip>
        ))}
        <select
          className={ui.select}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          aria-label="دسته‌بندی"
        >
          <option value="">همهٔ دسته‌ها</option>
          {categories.map((c) => (
            <option key={c.categorySlug} value={c.categorySlug}>
              {c.categoryName}
            </option>
          ))}
        </select>
        <Button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending || latest?.status === 'running'}
        >
          اجرای دستی
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : isError ? (
        <EmptyState
          tone="error"
          headline="خواندن گزارش ناموفق بود"
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          headline="هنوز تغییری ثبت نشده"
          body="پس از نخستین اجرای خودکار، هر قیمتی که سیستم بنویسد اینجا فهرست می‌شود."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">کالا</th>
                <th scope="col">قیمت قبلی</th>
                <th scope="col">قیمت جدید</th>
                <th scope="col">تغییر</th>
                <th scope="col">مأخذ</th>
                <th scope="col">وضعیت</th>
                <th scope="col">زمان</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const pct = changePct(e);
                return (
                  <tr key={e.id} className={e.outcome === 'skipped' ? ui.rowWarn : undefined}>
                    <td>
                      <span className={styles.primaryCell}>{e.skuName}</span>
                      <span className={ui.muted}>
                        {e.categoryName} › {e.subCategoryName}
                        {e.factory ? ` · ${e.factory}` : ''}
                      </span>
                    </td>
                    <td className="tnum">{e.oldPrice ? formatToman(e.oldPrice) : '—'}</td>
                    <td className="tnum">{e.newPrice ? formatToman(e.newPrice) : '—'}</td>
                    <td className="tnum">
                      {pct === null ? '—' : `${pct > 0 ? '+' : ''}${toPersianDigits(pct)}٪`}
                    </td>
                    <td>
                      {e.matchedName ? (
                        <>
                          <span className={styles.primaryCell}>{e.matchedName}</span>
                          <span className={ui.muted}>
                            {SOURCE_LABEL[e.source] ?? e.source}
                            {e.matchedCode ? ` · کد ${toPersianDigits(e.matchedCode)}` : ''}
                            {e.sourceUpdatedAt ? ` · ${toPersianDigits(e.sourceUpdatedAt)}` : ''}
                          </span>
                        </>
                      ) : (
                        <span className={ui.muted}>—</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={e.outcome === 'written' ? 'success' : 'neutral'}>
                        {REASON_LABEL[e.reason] ?? e.reason}
                      </Badge>
                    </td>
                    <td className="tnum">{formatJalali(e.appliedAt, 'yyyy/MM/dd HH:mm')}</td>
                    <td>
                      <button
                        type="button"
                        className={ui.linkButton}
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate({ skuId: e.skuId, next: !e.excluded })}
                      >
                        {e.excluded ? 'خودکار کن' : 'دستی نگه‌دار'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasNextPage ? (
        <div className={ui.toolbar}>
          <Button
            variant="secondary"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'در حال بارگذاری…' : 'موارد قدیمی‌تر'}
          </Button>
        </div>
      ) : null}

      <section className={ui.panel}>
        <Text variant="label">کالاهای دستی‌نگه‌داشته‌شده</Text>
        <Text variant="body-sm" color="muted">
          قیمت این کالاها فقط با ورود دستی تغییر می‌کند؛ اجرای خودکار به آن‌ها دست نمی‌زند.
        </Text>
        {excludedSkus.length === 0 ? (
          <Text variant="body-sm" color="muted">
            فعلاً هیچ کالایی مستثنی نشده — همهٔ کالاهای در دسترس خودکار به‌روزرسانی می‌شوند.
          </Text>
        ) : (
          <ul className={styles.excludedList}>
            {excludedSkus.map((s) => (
              <li key={s.id}>
                <span>
                  {s.name}
                  <span className={ui.muted}>
                    {' '}
                    {s.categoryName} › {s.subCategoryName}
                  </span>
                </span>
                <button
                  type="button"
                  className={ui.linkButton}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ skuId: s.id, next: false })}
                >
                  خودکار کن
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Stack>
  );
}
