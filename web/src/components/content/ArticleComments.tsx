import { getApprovedComments } from '@/lib/server/catalog';
import { formatJalali } from '@/lib/utils/jalali';
import { Heading, Text } from '@/components/ui';
import { CommentForm } from './CommentForm';
import styles from './ArticleComments.module.css';

/**
 * Reader comments (نظرات کاربران) — US-14.8, on every article page (blog and
 * news both), same "structural, not per-article opt-in" placement as
 * `ArticleFaq`. Unlike the FAQ section, this ALWAYS renders (even with zero
 * approved comments yet): the submit form is the point, and hiding the
 * whole section until the first approved comment exists would mean no
 * article could ever get its first one.
 */
export async function ArticleComments({ articleId, slug }: { articleId: string; slug: string }) {
  const comments = await getApprovedComments(articleId);

  return (
    <section aria-labelledby="article-comments-title" className={styles.section}>
      <Heading level={2} id="article-comments-title">
        نظرات کاربران
      </Heading>

      {comments.length > 0 ? (
        <ul className={styles.list} aria-label="نظرات تاییدشده">
          {comments.map((c) => (
            <li key={c.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.author}>{c.authorName ?? 'کاربر آهن‌تایم'}</span>
                <time className="tnum" dateTime={c.createdAt}>
                  {formatJalali(c.createdAt)}
                </time>
              </div>
              <Text>{c.body}</Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text color="muted">هنوز نظری ثبت نشده است؛ اولین نفری باشید که نظر می‌دهد.</Text>
      )}

      <CommentForm slug={slug} />
    </section>
  );
}
