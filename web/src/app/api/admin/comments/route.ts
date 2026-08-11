import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listCommentsForModeration, type CommentStatus } from '@/lib/server/repos/commentsRepo';

const VALID_STATUSES = new Set<CommentStatus>(['pending', 'approved', 'rejected']);

/** GET /api/admin/comments?status= — the moderation queue (US-14.8).
 *  Omitted `status` returns everything, pending-first (see
 *  `listCommentsForModeration`'s own comment on why). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const status = req.nextUrl.searchParams.get('status');
  const comments = await listCommentsForModeration(
    status && VALID_STATUSES.has(status as CommentStatus) ? (status as CommentStatus) : undefined,
  );
  return NextResponse.json({ comments }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
