'use client';
/**
 * The interactive half of ArticleComments (US-14.9 — the comments-UX
 * redesign). Everything that needs client state lives here: sort order,
 * helpful-vote optimistic updates, the submit form, and the "your own
 * comment appears immediately, tagged در انتظار بررسی" preview — a real
 * customer just wrote something and hearing nothing back until an admin
 * happens to check the queue read as the product having silently eaten
 * their comment, which is worse than being honest that it is pending.
 *
 * `initialComments` (approved, server-rendered — so search engines and a
 * no-JS visitor still see real comment content) never mutates in place;
 * sorting is a derived array, and the pending preview is a SEPARATE local
 * list rendered above it, never merged into it.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { formatJalali } from '@/lib/utils/jalali';
import { toPersianDigits } from '@/lib/utils/format';
import { Button, Text, Badge } from '@/components/ui';
import { Textarea } from '@/components/forms/fields';
import { CommentAvatar } from './CommentAvatar';
import styles from './CommentsSection.module.css';

export type PublicCommentDto = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  isVerifiedBuyer: boolean;
  helpfulCount: number;
  helpfulByMe: boolean;
};

const MAX_LEN = 1000;
type Sort = 'newest' | 'helpful';

export function CommentsSection({ slug, initialComments }: { slug: string; initialComments: PublicCommentDto[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const toast = useToast();

  const [comments, setComments] = useState(initialComments);
  const [sort, setSort] = useState<Sort>('newest');
  const [pending, setPending] = useState<{ id: string; body: string }[]>([]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...comments];
    if (sort === 'helpful') copy.sort((a, b) => b.helpfulCount - a.helpfulCount);
    else copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return copy;
  }, [comments, sort]);

  const totalCount = comments.length + pending.length;

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await api.comments.create(slug, trimmed);
      setPending((p) => [...p, { id: `local-${Date.now()}`, body: trimmed }]);
      setBody('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'ثبت نظر ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleHelpful = async (id: string) => {
    if (votingId) return;
    setVotingId(id);
    // Optimistic: flip immediately, reconcile with the server's real count
    // (or roll back entirely) once the request settles — a helpful click
    // that visibly waits for a round trip reads as broken, not careful.
    setComments((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, helpfulByMe: !c.helpfulByMe, helpfulCount: c.helpfulCount + (c.helpfulByMe ? -1 : 1) } : c,
      ),
    );
    try {
      const res = await api.comments.toggleHelpful(id);
      setComments((cs) => cs.map((c) => (c.id === id ? { ...c, helpfulByMe: res.voted, helpfulCount: res.count } : c)));
    } catch {
      setComments((cs) =>
        cs.map((c) =>
          c.id === id
            ? { ...c, helpfulByMe: !c.helpfulByMe, helpfulCount: c.helpfulCount + (c.helpfulByMe ? -1 : 1) }
            : c,
        ),
      );
      toast.error('ثبت رأی ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Text variant="label" color="muted">
          {toPersianDigits(totalCount)} نظر
        </Text>
        {comments.length > 1 ? (
          <div className={styles.sortTabs} role="group" aria-label="ترتیب نظرات">
            <button
              type="button"
              className={styles.sortBtn}
              aria-pressed={sort === 'newest'}
              onClick={() => setSort('newest')}
            >
              جدیدترین
            </button>
            <button
              type="button"
              className={styles.sortBtn}
              aria-pressed={sort === 'helpful'}
              onClick={() => setSort('helpful')}
            >
              پرمفیدترین
            </button>
          </div>
        ) : null}
      </div>

      {totalCount === 0 ? (
        <Text color="muted">هنوز نظری ثبت نشده است؛ اولین نفری باشید که نظر می‌دهد.</Text>
      ) : (
        <ul className={styles.list} aria-label="نظرات">
          {pending.map((p) => (
            <li key={p.id} className={`${styles.item} ${styles.itemPending}`}>
              <CommentAvatar name={user?.name ?? null} />
              <div className={styles.itemBody}>
                <div className={styles.itemHead}>
                  <span className={styles.author}>{user?.name ?? 'شما'}</span>
                  <Badge tone="stale">در انتظار بررسی</Badge>
                </div>
                <Text>{p.body}</Text>
                <Text color="muted" variant="caption">
                  فقط برای شما نمایش داده می‌شود، تا زمانی که تایید شود.
                </Text>
              </div>
            </li>
          ))}
          {sorted.map((c) => (
            <li key={c.id} className={styles.item}>
              <CommentAvatar name={c.authorName} />
              <div className={styles.itemBody}>
                <div className={styles.itemHead}>
                  <span className={styles.author}>{c.authorName ?? 'کاربر آهن‌تایم'}</span>
                  {c.isVerifiedBuyer ? <Badge tone="gain">خریدار تایید‌شده آهن‌تایم</Badge> : null}
                  <time className="tnum" dateTime={c.createdAt}>
                    {formatJalali(c.createdAt)}
                  </time>
                </div>
                <Text>{c.body}</Text>
                <button
                  type="button"
                  className={styles.helpfulBtn}
                  aria-pressed={c.helpfulByMe}
                  disabled={!isAuthenticated || votingId === c.id}
                  onClick={() => void toggleHelpful(c.id)}
                >
                  👍 مفید بود
                  {c.helpfulCount > 0 ? <span className="tnum">{toPersianDigits(c.helpfulCount)}</span> : null}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isLoading ? null : isAuthenticated ? (
        <div className={styles.form}>
          <Textarea
            label="نظر شما"
            value={body}
            maxLength={MAX_LEN}
            rows={3}
            placeholder="نظر یا تجربهٔ خود را دربارهٔ این مطلب بنویسید…"
            onChange={(e) => setBody(e.target.value)}
          />
          <div className={styles.formFoot}>
            <span className={styles.counter}>
              {toPersianDigits(body.length)}/{toPersianDigits(MAX_LEN)}
            </span>
            <Button type="button" size="sm" disabled={submitting || body.trim().length === 0} onClick={() => void submit()}>
              {submitting ? 'در حال ارسال…' : 'ثبت نظر'}
            </Button>
          </div>
        </div>
      ) : (
        <Text color="muted">
          برای ثبت نظر، <Link href="/login">وارد شوید</Link>.
        </Text>
      )}
    </div>
  );
}
