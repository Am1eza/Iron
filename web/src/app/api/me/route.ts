import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { userById } from '@/lib/auth/store';
import { publicUser } from '@/lib/auth/publicUser';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

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

export const GET = withApiErrorHandling(GETImpl);
