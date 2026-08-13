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
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { formatJalali } from '@/lib/utils/jalali';
import { toPersianDigits } from '@/lib/utils/format';
import { Button, Text, Badge, EmptyState } from '@/components/ui';
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
  const router = useRouter();

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

  // `helpfulByMe` can't be server-rendered on this ISR page (see
  // ArticleComments's comment) — resolved here instead, once, after the
  // signed-in state settles. Anonymous visitors never fire this at all.
  useEffect(() => {
    if (!isAuthenticated || initialComments.length === 0) return;
    let cancelled = false;
    void api.comments.myVotes(initialComments.map((c) => c.id)).then((res) => {
      if (cancelled || res.ids.length === 0) return;
      const voted = new Set(res.ids);
      setComments((cs) => cs.map((c) => (voted.has(c.id) ? { ...c, helpfulByMe: true } : c)));
    });
    return () => {
      cancelled = true;
    };
    // `initialComments` is this component's own initial prop, fixed for its
    // lifetime (a genuinely new comment list means a new page navigation,
    // hence a fresh mount) — only `isAuthenticated` settling is a reason
    // to re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
        // Was a single line of muted gray text — the least inviting way to
        // ask someone to be the first to post. A headline-weight prompt
        // with the brand glyph (the same `EmptyState` every other empty
        // list on the site uses, not a one-off) reads as "start the
        // conversation" instead of "nothing to see here".
        <EmptyState
          size="section"
          headingLevel={3}
          headline="هنوز نظری ثبت نشده"
          body="اولین نفری باشید که تجربه‌تان را دربارهٔ این مطلب می‌نویسید."
        />
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
        // Was a muted-gray inline text link — easy to read as decorative
        // and skip. A filled primary Button is the same visual weight as
        // the "ثبت نظر" submit button an authenticated reader sees, so the
        // signed-out state reads as "one step before that", not a dead end.
        <div className={styles.loginPrompt}>
          <Text color="muted">برای نوشتن نظر باید وارد حساب کاربری‌تان شوید.</Text>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => router.push(routes.login(window.location.pathname))}
          >
            ورود یا ثبت‌نام
          </Button>
        </div>
      )}
    </div>
  );
}
