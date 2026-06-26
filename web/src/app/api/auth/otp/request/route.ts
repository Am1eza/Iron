import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { otpRequestPayload } from '@/lib/validation/api';
import { normalizeMobile } from '@/lib/utils/format';
import { requestOtp } from '@/lib/auth/service';
import { authErrorResponse } from '@/lib/auth/apiError';
import { assertSameOrigin } from '@/lib/auth/origin';

/**
 * POST /api/auth/otp/request — issue + send an OTP (Kavenegar/dev) to a normalized
 * mobile. Rate-limited (cooldown / per-hour cap / lockout) in the auth service.
 */
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const v = await validateBody(req, otpRequestPayload);
  if (!v.ok) return v.response;

  const mobile = normalizeMobile(v.data.mobile);
  if (!mobile) {
    return NextResponse.json({ error: 'invalid_mobile', message: 'شمارهٔ موبایل نامعتبر است.' }, { status: 400 });
  }

  try {
    const { ttl, devCode } = await requestOtp(mobile, v.data.name);
    return NextResponse.json({ ok: true, ttl, devCode });
  } catch (err) {
    return authErrorResponse(err);
  }
}
