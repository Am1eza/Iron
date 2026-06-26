import { NextResponse, type NextRequest } from 'next/server';

/** POST /api/leads — a request → proforma (پیش‌فاکتور) + SMS + CRM lead (UX-flow F6).
 *  Stub: real generation (PDF, SMS, CRM persistence) lands in the commerce/backend sections. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.contact?.mobile || !Array.isArray(body?.items)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  // TODO(commerce): require verified OTP; build proforma; send SMS; create CRM lead with context.
  return NextResponse.json({ error: 'not_implemented', message: 'ثبت درخواست در بخش تجارت فعال می‌شود.' }, { status: 501 });
}
