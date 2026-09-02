import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { conversationForUser } from '@/lib/server/repos/aiConversationsRepo';

export const runtime = 'nodejs';

/**
 * GET /api/ai/conversations/[id] — reopen one of this user's own threads.
 *
 * A 404 (not a 403) for a conversation that exists but belongs to somebody
 * else: distinguishing the two tells an attacker holding a guessed id that it
 * is real, and a conversation id is echoed to the client, persists in a
 * browser and survives on a shared device.
 *
 * Only the persisted TEXT comes back. The generative-UI cards are not stored —
 * they are built per turn from live catalog rows — so a reopened thread shows
 * the conversation, and any price in it is re-fetched by asking again. That is
 * the honest behaviour: replaying a three-week-old comparison card as though
 * it were current is precisely the thing this advisor's freshness stamps exist
 * to prevent.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;

  const { id } = await ctx.params;
  const conversation = await conversationForUser(id, auth.session.id);
  if (!conversation) {
    return NextResponse.json({ error: 'not_found', message: 'این گفتگو پیدا نشد.' }, { status: 404 });
  }
  return NextResponse.json(conversation, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET = withApiErrorHandling(GETImpl);
