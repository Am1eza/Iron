import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { profileUpdatePayload } from '@/lib/validation/api';
import { getSessionVerified } from '@/lib/auth/session';
import { updateUser } from '@/lib/auth/store';
import { publicUser } from '@/lib/auth/publicUser';
import { assertSameOrigin } from '@/lib/auth/origin';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/** PUT /api/me/profile — update the signed-in user's profile (name). */
async function PUTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }

  const v = await validateBody(req, profileUpdatePayload);
  if (!v.ok) return v.response;

  const updated = await updateUser(session.id, { name: v.data.name });
  if (!updated) {
    return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });
  }
  return NextResponse.json({ user: publicUser(updated) });
}

export const PUT = withApiErrorHandling(PUTImpl);
