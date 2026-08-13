import { getApprovedComments } from '@/lib/server/catalog';
import { Heading, Card } from '@/components/ui';
import { CommentsSection } from './CommentsSection';
import styles from './ArticleComments.module.css';

/**
 * Reader comments (نظرات کاربران) — US-14.8/US-14.9, on every article page
 * (blog and news both), same "structural, not per-article opt-in" placement
 * as `ArticleFaq`. Always renders, even with zero comments yet: the submit
 * form is the point, and hiding the section until a first comment exists
 * would mean no article could ever get one.
 *
 * Wrapped in the same bordered `Card` `ArticleFaq` uses, for the same
 * reason: unwrapped, this section had no visual boundary from the article
 * prose above it — just a heading and a hairline-divided list that read as
 * more of the page, not a distinct module a reader would trust enough to
 * post in. `CommentsSection`'s own empty-state and login-prompt polish is
 * the other half of that fix (see its file).
 *
 * Deliberately does NOT read the current viewer's session here.
 * `/blog/[slug]` and `/news/[slug]` are ISR pages (`revalidate = 600` —
 * the SAME rendered HTML is shared across every visitor for up to that
 * window), and `cookies()`/`headers()` (which `getSessionVerified()` reads
 * internally) inside a route eligible for that kind of caching throws
 * `DYNAMIC_SERVER_USAGE` in this Next version — confirmed live: this
 * exact article 500'd in production the moment this file called it.
 * `isVerifiedBuyer` is genuinely data-only (a join against `orders`, not
 * the request) and stays server-computed; `helpfulByMe` is the one
 * per-VIEWER field, and it is resolved CLIENT-SIDE instead — see
 * `CommentsSection`'s `myVotes` fetch, the same "session state is a client
 * hook, never a server cookie read" rule `useAuth()` already follows for
 * this exact reason.
 */
export async function ArticleComments({ articleId, slug }: { articleId: string; slug: string }) {
  const comments = await getApprovedComments(articleId);

  return (
    <section aria-labelledby="article-comments-title">
      <Card className={styles.card}>
        <Heading level={2} id="article-comments-title">
          نظرات کاربران
        </Heading>
        <CommentsSection slug={slug} initialComments={comments} />
      </Card>
    </section>
  );
}
