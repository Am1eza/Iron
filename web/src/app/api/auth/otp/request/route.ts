import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { otpRequestPayload } from '@/lib/validation/api';
import { normalizeMobile } from '@/lib/utils/format';
import { requestOtp } from '@/lib/auth/service';
import { authErrorResponse } from '@/lib/auth/apiError';
import { assertSameOrigin } from '@/lib/auth/origin';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/**
 * POST /api/auth/otp/request — issue + send an OTP (SMS.ir/dev) to a normalized
 * mobile. Per-mobile throttling (cooldown / per-hour cap / lockout) lives in the
 * auth service; the IP limit here stops one client from spraying OTP requests
 * across many DIFFERENT mobile numbers (SMS-cost / toll-fraud abuse) which the
 * per-mobile limit alone can't catch.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const limited = await rateLimit(req, 'otp-request', { limit: 8, windowMs: 5 * 60_000 });
  if (limited) return limited;

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

export const POST = withApiErrorHandling(POSTImpl);
