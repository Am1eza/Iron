import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { toggleHelpfulVote } from '@/lib/server/repos/commentsRepo';

/**
 * POST /api/comments/{id}/helpful — "این نظر مفید بود؟" (US-14.9). A
 * toggle, not a one-way increment: calling it again on the same comment
 * removes the viewer's own vote. Login-gated like submitting a comment
 * itself — an anonymous "helpful" click would be indistinguishable from a
 * bot inflating a comment's rank.
 */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const limited = await rateLimit(req, 'comment-helpful', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await ctx.params;
  const result = await toggleHelpfulVote(id, auth.session.id);
  return NextResponse.json(result);
}

export const POST = withApiErrorHandling(POSTImpl);
