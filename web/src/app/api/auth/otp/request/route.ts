import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
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
    // otpRequestPayload's mobileSchema already accepted this as a valid
    // international number (E.164) — it just isn't Iranian, and SMS.ir
    // (OTP delivery) is Iran-only today. A distinct error/status from
    // "not a phone number at all" so the client can show the real reason
    // instead of a generic "invalid number" message. See GEO-ROUTING.md's
    // phone-input note and lib/utils/phone.ts's header comment.
    const t = await getTranslations('phone');
    return NextResponse.json(
      { error: 'otp_country_unsupported', message: t('otpCountryUnsupported') },
      { status: 422 },
    );
  }

  try {
    const { ttl, devCode, isNewUser } = await requestOtp(mobile, v.data.name);
    return NextResponse.json({ ok: true, ttl, devCode, isNewUser });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export const POST = withApiErrorHandling(POSTImpl);
