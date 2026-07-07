import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { getSessionVerified } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getUserProfile, submitLevel2, submitLevel3 } from '@/lib/server/repos/verificationRepo';

/** GET /api/me/verification — the signed-in user's verification state. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const profile = await getUserProfile(auth.session.id);
  if (!profile) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });
  return NextResponse.json(
    {
      verificationLevel: profile.verificationLevel,
      idVerifyStatus: profile.idVerifyStatus,
      bizVerifyStatus: profile.bizVerifyStatus,
      nationalId: profile.nationalId ?? null,
      companyName: profile.companyName ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const payload = z.discriminatedUnion('level', [
  z.object({ level: z.literal(2), nationalId: z.string().trim().min(1) }),
  z.object({
    level: z.literal(3),
    companyName: z.string().trim().min(1).max(120),
    companyNationalId: z.string().trim().min(1),
    economicCode: z.string().trim().min(1),
  }),
]);

/** POST /api/me/verification — submit level-2 (کد ملی) or level-3 (business)
 *  info for admin review. Self-attested → status 'pending'. */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const guard = requireDb();
  if (guard) return guard;
  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const result =
    v.data.level === 2
      ? await submitLevel2(session.id, { nationalId: v.data.nationalId })
      : await submitLevel3(session.id, {
          companyName: v.data.companyName,
          companyNationalId: v.data.companyNationalId,
          economicCode: v.data.economicCode,
        });
  if (!result.ok) {
    return NextResponse.json({ error: 'invalid', message: result.error }, { status: 400 });
  }
  const profile = await getUserProfile(session.id);
  return NextResponse.json({
    ok: true,
    verificationLevel: profile?.verificationLevel ?? 1,
    idVerifyStatus: profile?.idVerifyStatus,
    bizVerifyStatus: profile?.bizVerifyStatus,
  });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
