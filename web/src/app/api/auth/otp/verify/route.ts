import { NextResponse, type NextRequest } from 'next/server';

/** POST /api/auth/otp/verify — verify code, create/auth user + session.
 *  Stub: real verification (attempts/lock/session cookie) lands in the auth section. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.mobile || !body?.code) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  // TODO(auth): check code within TTL/attempts; on success set session cookie + return user.
  return NextResponse.json({ error: 'not_implemented', message: 'تأیید کد در بخش حساب فعال می‌شود.' }, { status: 501 });
}
