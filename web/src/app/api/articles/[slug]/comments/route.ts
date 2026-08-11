import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { commentBodySchema } from '@/lib/validation/utils';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { findPublishedBySlug } from '@/lib/server/repos/articlesRepo';
import { createComment } from '@/lib/server/repos/commentsRepo';

const payload = z.object({ body: commentBodySchema });

/**
 * POST /api/articles/{slug}/comments — submit a reader comment (US-14.8).
 * Login-gated (`requireApiUser`) rather than anonymous, and every comment is
 * born `pending` — see `commentsRepo.ts`'s own comment on why those two
 * together are the whole spam defense for a first version.
 */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const limited = await rateLimit(req, 'comments', { limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const { slug } = await ctx.params;
  const article = await findPublishedBySlug(decodeURIComponent(slug));
  if (!article) {
    return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  }
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const comment = await createComment({ articleId: article.id, userId: auth.session.id, body: v.data.body });
  return NextResponse.json({ comment }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);
