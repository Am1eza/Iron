import { NextResponse, type NextRequest } from 'next/server';
import { getSessionVerified } from '@/lib/auth/session';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { myHelpfulVotes } from '@/lib/server/repos/commentsRepo';

/**
 * GET /api/comments/my-votes?ids=a,b,c — which of these comment ids the
 * CURRENT viewer has already voted "helpful" on (US-14.9).
 *
 * A Route Handler, not something read inside a page: `/blog/[slug]` and
 * `/news/[slug]` are ISR-cached (`revalidate = 600`), and a page reading
 * the session cookie there throws `DYNAMIC_SERVER_USAGE` (confirmed live —
 * see `ArticleComments`'s own comment). A Route Handler has no such
 * constraint; it always runs per request. Anonymous callers get an empty
 * list rather than 401 — "which of these have I voted for" has an honest
 * answer for a visitor with no session: none.
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ ids: [] });
  const session = await getSessionVerified();
  if (!session) return NextResponse.json({ ids: [] });
  const voted = await myHelpfulVotes(ids, session.id);
  return NextResponse.json({ ids: voted }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
