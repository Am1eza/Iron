import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { otpRequestPayload } from '@/lib/validation/api';
import { CONSTANTS } from '@/lib/config/constants';

/** POST /api/auth/otp/request — send an OTP (Kavenegar) to a normalized Iranian mobile.
 *  Server-validates the body; real send + rate-limit (acceptance-criteria §F2) lands in the auth section. */
export async function POST(req: NextRequest) {
  const v = await validateBody(req, otpRequestPayload);
  if (!v.ok) return v.response;
  // TODO(auth): rate-limit per number+IP; generate + store OTP; send via Kavenegar.
  return NextResponse.json({ ok: true, ttl: CONSTANTS.OTP_TTL_SECONDS });
}
