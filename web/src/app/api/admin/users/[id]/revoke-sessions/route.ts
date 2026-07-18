import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { userById, revokeSessionsForUser } from '@/lib/auth/store';

/** POST /api/admin/users/{id}/revoke-sessions — ends every session for this
 *  user right now (US-21.3): clears refresh tokens AND bumps tokenVersion,
 *  so an already-issued access token is rejected on its very next request
 *  too, not just once it naturally expires. Distinct from the PATCH route's
 *  role/isActive-triggered revoke — this fires standalone, with no other
 *  field changing (e.g. "I think this account's session leaked, kill it"). */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;

  const user = await userById(id);
  if (!user) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });

  await revokeSessionsForUser(id);
  await audit(auth.session.id, 'user.revoke_sessions', { type: 'user', id });
  return NextResponse.json({ ok: true });
}

export const POST = withApiErrorHandling(POSTImpl);
