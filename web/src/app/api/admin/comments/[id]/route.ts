import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { moderateComment } from '@/lib/server/repos/commentsRepo';

const payload = z.object({ status: z.enum(['approved', 'rejected']) });

/** PATCH /api/admin/comments/{id} — approve or reject (US-14.8). No
 *  "un-approve"/"un-reject" here: moderation is a one-way queue-clearing
 *  decision, and re-opening it belongs to a future edit feature, not this
 *  one — same scope discipline as the article endpoints' own status split. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const ok = await moderateComment(id, v.data.status, auth.session.id);
  if (!ok) {
    return NextResponse.json({ error: 'not_found', message: 'نظر یافت نشد.' }, { status: 404 });
  }
  await audit(auth.session.id, 'content.moderate_comment', { type: 'comment', id }, null, { status: v.data.status });
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
