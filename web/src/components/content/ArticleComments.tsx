import { getApprovedComments } from '@/lib/server/catalog';
import { getSessionVerified } from '@/lib/auth/session';
import { Heading } from '@/components/ui';
import { CommentsSection } from './CommentsSection';

/**
 * Reader comments (نظرات کاربران) — US-14.8/US-14.9, on every article page
 * (blog and news both), same "structural, not per-article opt-in" placement
 * as `ArticleFaq`. Always renders, even with zero comments yet: the submit
 * form is the point, and hiding the section until a first comment exists
 * would mean no article could ever get one.
 *
 * Server-fetches with the CURRENT viewer's id (if signed in) so the
 * approved list already carries accurate `helpfulByMe`/verified-buyer
 * data on first paint — see `commentsRepo.listApprovedComments`. Everything
 * interactive (sorting, voting, the submit form, the optimistic pending
 * preview) lives in `CommentsSection`, a client component.
 */
export async function ArticleComments({ articleId, slug }: { articleId: string; slug: string }) {
  const viewer = await getSessionVerified();
  const comments = await getApprovedComments(articleId, viewer?.id);

  return (
    <section aria-labelledby="article-comments-title">
      <Heading level={2} id="article-comments-title">
        نظرات کاربران
      </Heading>
      <CommentsSection slug={slug} initialComments={comments} />
    </section>
  );
}
