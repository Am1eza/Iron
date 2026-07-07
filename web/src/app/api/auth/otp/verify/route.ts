import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { otpVerifyPayload } from '@/lib/validation/api';
import { normalizeMobile, normalizeDigits } from '@/lib/utils/format';
import { verifyOtp } from '@/lib/auth/service';
import { setSessionCookies } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/apiError';
import { assertSameOrigin } from '@/lib/auth/origin';
import { publicUser } from '@/lib/auth/publicUser';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/**
 * POST /api/auth/otp/verify — verify the code, login or register, set the session
 * cookies (access + refresh), and return the public user. Wrong codes count toward
 * the per-mobile attempt limit (handled in the service); the IP limit here stops
 * one client from spreading brute-force attempts across many mobile numbers.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const limited = await rateLimit(req, 'otp-verify', { limit: 20, windowMs: 5 * 60_000 });
  if (limited) return limited;

  const v = await validateBody(req, otpVerifyPayload);
  if (!v.ok) return v.response;

  const mobile = normalizeMobile(v.data.mobile);
  if (!mobile) {
    return NextResponse.json({ error: 'invalid_mobile', message: 'شمارهٔ موبایل نامعتبر است.' }, { status: 400 });
  }

  try {
    const { user, tokens, isNew } = await verifyOtp(mobile, normalizeDigits(v.data.code), {
      firstName: v.data.firstName,
      lastName: v.data.lastName,
      inviteCode: v.data.inviteCode,
    });
    await setSessionCookies(tokens);
    return NextResponse.json({ user: publicUser(user), isNew });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export const POST = withApiErrorHandling(POSTImpl);
