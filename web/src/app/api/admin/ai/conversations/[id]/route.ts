import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { conversationThread, conversationExists } from '@/lib/server/repos/aiReviewRepo';

/** GET /api/admin/ai/conversations/[id] — the full message thread around a
 *  flagged answer, for review context. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;

  const { id } = await ctx.params;
  if (!(await conversationExists(id))) {
    return NextResponse.json({ error: 'not_found', message: 'مکالمه یافت نشد.' }, { status: 404 });
  }
  const messages = await conversationThread(id);
  return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
