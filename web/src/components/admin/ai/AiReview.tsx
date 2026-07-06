'use client';
/** AI advisor review — flagged answers (👍/👎) with full conversation context.
 *  Increment 1 of the continuous-improvement loop: read-only review today;
 *  "promote to correction/eval" is the next increment (see docs/roadmap). */
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatJalali } from '@/lib/utils/format';
import { Badge, Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

const RATING_FILTERS = [
  { id: '' as const, label: 'همه' },
  { id: 'down' as const, label: '👎 نامفید' },
  { id: 'up' as const, label: '👍 مفید' },
];

export function AiReview() {
  const [rating, setRating] = useState<'' | 'up' | 'down'>('down');
  const [openConversation, setOpenConversation] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'ai-feedback', rating],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      adminApi.aiFeedback({ rating: rating || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];
  const summary = data?.pages[0]?.summary;

  return (
    <div>
      {summary && (
        <div className={ui.tiles} style={{ marginBlockEnd: 'var(--space-5)' }}>
          <div className={ui.tile}>
            <div className={ui.tileValue}>{summary.up}</div>
            <div className={ui.tileLabel}>👍 مفید (کل)</div>
          </div>
          <div className={`${ui.tile} ${summary.down > 0 ? ui.tileBad : ''}`}>
            <div className={ui.tileValue}>{summary.down}</div>
            <div className={ui.tileLabel}>👎 نامفید (کل)</div>
          </div>
          <div className={`${ui.tile} ${summary.last7dDown > 0 ? ui.tileBad : ''}`}>
            <div className={ui.tileValue}>{summary.last7dDown}</div>
            <div className={ui.tileLabel}>👎 هفت روز اخیر</div>
          </div>
        </div>
      )}

      <div className={ui.toolbar}>
        {RATING_FILTERS.map((f) => (
          <Chip key={f.id} selected={rating === f.id} onClick={() => setRating(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری بازخوردها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          size="section"
          headline="بازخوردی نیست"
          body="وقتی کاربران روی پاسخ دستیار 👍 یا 👎 بزنند، اینجا نمایش داده می‌شود."
        />
      ) : (
        <table className={ui.table}>
          <caption className="visually-hidden">فهرست بازخوردهای ثبت‌شده روی پاسخ‌های دستیار هوشمند</caption>
          <thead>
            <tr>
              <th scope="col">زمان</th>
              <th scope="col">امتیاز</th>
              <th scope="col">پاسخ</th>
              <th scope="col">دلیل</th>
              <th scope="col">مکالمه</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="tnum">{formatJalali(e.createdAt)}</td>
                <td>
                  <Badge tone={e.rating === 'down' ? 'loss' : 'success'}>
                    {e.rating === 'down' ? '👎 نامفید' : '👍 مفید'}
                  </Badge>
                </td>
                <td className={ui.textCell}>{e.answerText ?? <span className={ui.muted}>پاک‌شده</span>}</td>
                <td className={ui.muted}>{e.reason ?? '—'}</td>
                <td>
                  {e.conversationId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenConversation((cur) => (cur === e.conversationId ? null : e.conversationId!))}
                    >
                      {openConversation === e.conversationId ? 'بستن' : 'نمایش گفتگو'}
                    </Button>
                  ) : (
                    '—'
                  )}
                  {openConversation === e.conversationId && e.conversationId && (
                    <ConversationThread conversationId={e.conversationId} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasNextPage && (
        <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
          <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? 'در حال بارگذاری…' : 'نمایش موارد قدیمی‌تر'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ConversationThread({ conversationId }: { conversationId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'ai-conversation', conversationId],
    queryFn: () => adminApi.aiConversation(conversationId),
  });

  if (isLoading) return <div className={ui.muted}>در حال بارگذاری گفتگو…</div>;
  if (isError || !data) return <div className={ui.muted}>بارگذاری گفتگو ناموفق بود.</div>;

  return (
    <div className={ui.panel} style={{ marginBlockStart: 'var(--space-2)' }}>
      {data.messages.map((m) => (
        <p key={m.id} style={{ margin: '0 0 var(--space-2)' }}>
          <strong>{m.role === 'user' ? 'کاربر' : 'دستیار'}:</strong> {m.content}
        </p>
      ))}
    </div>
  );
}
