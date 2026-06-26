import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { leadPayload } from '@/lib/validation/api';

/** POST /api/leads — a request → proforma (پیش‌فاکتور) + SMS + CRM lead (UX-flow F6).
 *  Server-validates the body; real generation (PDF, SMS, CRM) lands in the commerce/backend sections. */
export async function POST(req: NextRequest) {
  const v = await validateBody(req, leadPayload);
  if (!v.ok) return v.response;
  // TODO(commerce): require verified OTP; build proforma; send SMS; create CRM lead with context.
  return NextResponse.json(
    { error: 'not_implemented', message: 'ثبت درخواست در بخش تجارت فعال می‌شود.' },
    { status: 501 },
  );
}
