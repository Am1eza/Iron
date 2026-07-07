import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { leadPayload } from '@/lib/validation/api';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createLead } from '@/lib/server/services/leads.service';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { withIdempotency } from '@/lib/server/utils/idempotency';
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

  // Idempotency: a double-submit (double-click, network retry) of the SAME
  // request must not create a second lead + پیش‌فاکتور + SMS. Keyed on contact
  // mobile + exact item set + a 2-minute time bucket. The bucket is CRUCIAL:
  // without it a `done` row lives 24h, so a buyer legitimately re-requesting the
  // identical cart hours later (fresh quote in a volatile market) would be
  // silently replayed — no new lead/proforma/SMS. With it, only near-simultaneous
  // resubmits collide; a deliberate re-request minutes later goes through.
  const bucket = Math.floor(Date.now() / 120_000);
  const dedupeKey = `${v.data.contact.mobile}:${v.data.items
    .map((i) => `${i.skuId}x${i.qty}`)
    .sort()
    .join(',')}:${bucket}`;

  try {
    return await withIdempotency(req, 'leads', dedupeKey, async () => {
      const session = await getSession();
      const result = await createLead(
        {
          contact: v.data.contact,
          items: v.data.items,
          channel: v.data.channel,
          source: v.data.source,
          note: v.data.note,
        },
        session,
      );
      return { status: 201, body: result };
    });
  } catch (err) {
    reportError(err, { route: 'leads' });
    return NextResponse.json(
      { error: 'lead_failed', message: 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}

export const POST = withApiErrorHandling(POSTImpl);
