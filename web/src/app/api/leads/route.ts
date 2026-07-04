import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { leadPayload } from '@/lib/validation/api';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createLead } from '@/lib/server/services/leads.service';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { reportError } from '@/lib/errors/report';

/** POST /api/leads — request → پیش‌فاکتور + SMS + CRM lead (UX-flow F6). */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'leads', { limit: 10 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const v = await validateBody(req, leadPayload);
  if (!v.ok) return v.response;

  try {
    const session = await getSession();
    const result = await createLead(
      {
        contact: v.data.contact,
        items: v.data.items,
        channel: v.data.channel,
        source: v.data.source,
        note: (v.data as { note?: string }).note,
      },
      session,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    reportError(err, { route: 'leads' });
    return NextResponse.json(
      { error: 'lead_failed', message: 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}

export const POST = withApiErrorHandling(POSTImpl);
