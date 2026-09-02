import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listConversationsForUser } from '@/lib/server/repos/aiConversationsRepo';

export const runtime = 'nodejs';

/**
 * GET /api/ai/conversations — this user's own advisor threads, newest first.
 *
 * Auth is REQUIRED and the scoping is the whole security story: an anonymous
 * visitor's conversations are stored with a null `user_id` and are reachable
 * only from the browser that created them, which is the right behaviour on the
 * shared phone in a site office. The repo scopes by `userId` inside the query
 * rather than filtering afterwards — the same rule `ensureConversation`
 * already applies to attaching to a conversation.
 *
 * Returns titles and timestamps only, never message bodies: the rail needs a
 * list, and a list endpoint that ships every transcript is a much larger thing
 * to leak if the scoping is ever wrong.
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;

  const conversations = await listConversationsForUser(auth.session.id);
  return NextResponse.json(
    { conversations },
    // Private and never stored: a shared cache holding one customer's
    // conversation titles under a URL with no user in it is exactly the
    // mistake this header exists to prevent.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
