import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import {
  requireApiPermission,
  requireDb,
  audit,
  withApiErrorHandling,
} from '@/lib/server/utils/apiGuard';
import { updateArticle } from '@/lib/server/repos/articlesRepo';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';

const payload = z.object({ publishAt: z.string().datetime().optional() });

/** POST /api/admin/articles/{id}/publish — approve: publish now or schedule.
 *  Requires content:publish (the editor-approval gate for AI drafts). */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:publish');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const future = v.data.publishAt && new Date(v.data.publishAt).getTime() > Date.now();
  const article = await updateArticle(id, {
    status: future ? 'scheduled' : 'published',
    publishAt: v.data.publishAt ? new Date(v.data.publishAt) : new Date(),
    approvedBy: auth.session.id,
  });
  if (!article)
    return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'content.publish', { type: 'article', id }, null, {
    publishAt: article.publishAt,
  });
  // Bust the ISR cache for the list + detail page immediately (not scheduled —
  // an editor approving/publishing now expects it live right away).
  if (!future) {
    const base = article.type === 'news' ? '/news' : '/blog';
    safeRevalidatePath(base, 'layout');
  }
  return NextResponse.json({ article });
}

export const POST = withApiErrorHandling(POSTImpl);
