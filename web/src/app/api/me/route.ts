import { NextResponse, type NextRequest } from 'next/server';
import { ulid } from 'ulid';
import { getSession, clearSessionCookies } from '@/lib/auth/session';
import { userById, updateUser, revokeAllForUser } from '@/lib/auth/store';
import { publicUser } from '@/lib/auth/publicUser';
import { requireApiUser, requireDb, withApiErrorHandling, audit } from '@/lib/server/utils/apiGuard';

/** GET /api/me — the current user (from the access cookie), or 401 if anonymous. */
async function GETImpl() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }
  // Re-read from the repo so name/role/club changes reflect without a new login.
  const fresh = await userById(session.id);
  return NextResponse.json({ user: publicUser(fresh ?? session) });
}

/**
 * DELETE /api/me — account erasure («حذف حساب کاربری»). Historical business
 * records (orders, leads, audit entries) reference this user with
 * onDelete: 'set null', and a couple (warehouse_items, user_requests) are
 * plain RESTRICT by design (see their schema comments) — so a literal
 * `DELETE FROM users` would either silently orphan that history or fail
 * outright the moment the account has one warehouse item or filed request.
 * Anonymize + deactivate instead: PII (name, mobile) is scrubbed to an
 * unguessable placeholder, every refresh token is revoked, the account is
 * deactivated (store.pg.ts's `userWhere` already excludes inactive users,
 * so login and any future `userById` lookup stop resolving it), and the
 * browser's own session cookies are cleared immediately.
 */
async function DELETEImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const { session } = auth;

  await audit(session.id, 'account.delete', { type: 'user', id: session.id }, { mobile: session.mobile, name: session.name });
  await revokeAllForUser(session.id);
  await updateUser(session.id, { name: '', mobile: `deleted:${ulid()}`, isActive: false });
  await clearSessionCookies();

  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
