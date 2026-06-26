import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { otpVerifyPayload } from '@/lib/validation/api';

/** POST /api/auth/otp/verify — verify code, create/auth user + session.
 *  Server-validates the body; real verification (attempts/lock/session cookie) lands in the auth section. */
export async function POST(req: NextRequest) {
  const v = await validateBody(req, otpVerifyPayload);
  if (!v.ok) return v.response;
  // TODO(auth): check code within TTL/attempts; on success set session cookie + return user.
  return NextResponse.json(
    { error: 'not_implemented', message: 'تأیید کد در بخش حساب فعال می‌شود.' },
    { status: 501 },
  );
}
