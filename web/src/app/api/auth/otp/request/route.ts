import { NextResponse, type NextRequest } from 'next/server';
import { normalizeMobile } from '@/lib/utils/format';

/** POST /api/auth/otp/request — send an OTP (Kavenegar) to a normalized Iranian mobile.
 *  Stub: validates the number; real send + rate-limit (acceptance-criteria §F2) lands in the auth section. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mobile = body?.mobile ? normalizeMobile(String(body.mobile)) : null;
  if (!mobile) {
    return NextResponse.json({ error: 'invalid_mobile', message: 'شمارهٔ موبایل نامعتبر است.' }, { status: 400 });
  }
  // TODO(auth): rate-limit per number+IP; generate + store OTP; send via Kavenegar.
  return NextResponse.json({ ok: true, ttl: 120 });
}
