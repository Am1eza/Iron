import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { profileUpdatePayload } from '@/lib/validation/api';
import { getSessionVerified } from '@/lib/auth/session';
import { updateUser } from '@/lib/auth/store';
import { publicUser } from '@/lib/auth/publicUser';
import { assertSameOrigin } from '@/lib/auth/origin';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/** PUT /api/me/profile — update the signed-in user's name (first + last). A
 *  completed name also earns the club "profile complete" bonus, so recompute
 *  the tier afterwards. */
async function PUTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }

  const v = await validateBody(req, profileUpdatePayload);
  if (!v.ok) return v.response;

  const name = `${v.data.firstName} ${v.data.lastName}`.trim();
  const updated = await updateUser(session.id, {
    firstName: v.data.firstName,
    lastName: v.data.lastName,
    name,
  });
  if (!updated) {
    return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });
  }
  // Completing the profile can advance the club tier (points model).
  import('@/lib/server/repos/clubRepo')
    .then((m) => m.recomputeTier(session.id))
    .catch(() => {});
  return NextResponse.json({ user: publicUser(updated) });
}

export const PUT = withApiErrorHandling(PUTImpl);
