import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { conversationThread, conversationExists, conversationHasFeedback } from '@/lib/server/repos/aiReviewRepo';

/** GET /api/admin/ai/conversations/[id] — the full message thread around a
 *  flagged answer, for review context.
 *
 * J-227: the review UI only ever links here from a real 👍/👎 feedback row —
 * an admin (`ai:review` is admin-only already) typing/guessing a conversation
 * ULID must not be able to read an un-flagged customer conversation straight
 * from the API. Same non-disclosure shape as `conversationExists`: 404 either
 * way, so "doesn't exist" and "exists but isn't flagged" look identical. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;

  const { id } = await ctx.params;
  if (!(await conversationExists(id)) || !(await conversationHasFeedback(id))) {
    return NextResponse.json({ error: 'not_found', message: 'مکالمه یافت نشد.' }, { status: 404 });
  }
  const messages = await conversationThread(id);
  return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
