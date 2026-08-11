'use client';
/**
 * The comment moderation queue (US-14.8) — a "نظرات" tab beside the article
 * status tabs in the same محتوا page, since this is exactly where the admin
 * already looks for anything content-related; a whole new nav item for one
 * small queue would be one more place to remember, which is the opposite of
 * what Amir's explicit "non-technical admin must never be confused" ask
 * means in practice.
 */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi, type AdminComment } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { useToast } from '@/lib/hooks/useToast';
import { formatJalali } from '@/lib/utils/jalali';
import { Badge, Button, EmptyState, TableSkeleton, Tabs, TabPanel, Text } from '@/components/ui';
import ui from '../adminUi.module.css';
import s from './comments.module.css';

const FILTER_TABS = [
  { id: 'pending', label: 'در انتظار بررسی' },
  { id: 'approved', label: 'تاییدشده' },
  { id: 'rejected', label: 'ردشده' },
];

const STATUS_LABEL: Record<AdminComment['status'], { label: string; tone: 'stale' | 'gain' | 'loss' }> = {
  pending: { label: 'در انتظار', tone: 'stale' },
  approved: { label: 'تاییدشده', tone: 'gain' },
  rejected: { label: 'ردشده', tone: 'loss' },
};

function articlePath(type: 'blog' | 'news', slug: string): string {
  return type === 'news' ? `/news/${encodeURIComponent(slug)}` : `/blog/${encodeURIComponent(slug)}`;
}

export function CommentsModeration() {
  const [filter, setFilter] = useState('pending');
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'comments', filter],
    queryFn: () => adminApi.comments.list(filter as 'pending' | 'approved' | 'rejected'),
  });
  const comments = data?.comments ?? [];

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      adminApi.comments.moderate(id, status),
    onSuccess: (_res, { status }) => {
      toast.success(status === 'approved' ? 'نظر تایید و روی سایت نمایش داده شد.' : 'نظر رد شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'comments'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'عملیات ناموفق بود.'),
  });

  return (
    <div>
      <Tabs items={FILTER_TABS} active={filter} onChange={setFilter} label="وضعیت نظرات" idBase="comments" />
      <TabPanel id={filter} active={filter} idBase="comments">
        <div style={{ paddingBlockStart: 'var(--space-4)' }}>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : comments.length === 0 ? (
            <EmptyState
              size="section"
              headline={filter === 'pending' ? 'نظری در انتظار بررسی نیست' : 'نظری در این وضعیت نیست'}
              body="به‌محض ثبت نظر تازه توسط مشتریان، اینجا نمایش داده می‌شود."
            />
          ) : (
            <ul className={s.list} aria-label="نظرات کاربران">
              {comments.map((c) => (
                <li key={c.id} className={s.row}>
                  <div className={s.rowHead}>
                    <a href={articlePath(c.articleType, c.articleSlug)} target="_blank" rel="noreferrer">
                      {c.articleTitle}
                    </a>
                    <Badge tone={STATUS_LABEL[c.status].tone}>{STATUS_LABEL[c.status].label}</Badge>
                  </div>
                  <Text>{c.body}</Text>
                  <div className={s.rowFoot}>
                    <span className={ui.tileHint}>
                      {c.authorName ?? 'کاربر'} · {c.authorMobile ?? ''} · {formatJalali(c.createdAt)}
                    </span>
                    {c.status === 'pending' ? (
                      <div className={s.actions}>
                        <Button
                          type="button"
                          size="sm"
                          disabled={moderate.isPending}
                          onClick={() => moderate.mutate({ id: c.id, status: 'approved' })}
                        >
                          تایید
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={moderate.isPending}
                          onClick={() => moderate.mutate({ id: c.id, status: 'rejected' })}
                        >
                          رد
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabPanel>
    </div>
  );
}
