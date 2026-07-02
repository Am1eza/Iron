import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { cooperationSchema } from '@/lib/validation/schemas';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getSession } from '@/lib/auth/session';
import { insertLead } from '@/lib/server/repos/leadsRepo';
import { nextRef } from '@/lib/server/utils/refs';
import { reportError } from '@/lib/errors/report';
import { rateLimit } from '@/lib/server/utils/rateLimit';

const TRACK_TYPE = { analysis: 'market-analysis', supply: 'supply', sell: 'sell' } as const;

/** POST /api/cooperation — a cooperation track submission → CRM lead. */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = rateLimit(req, 'cooperation', { limit: 5 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const v = await validateBody(req, cooperationSchema);
  if (!v.ok) return v.response;

  try {
    const session = await getSession();
    const ref = await nextRef('LD');
    await insertLead({
      ref,
      userId: session?.id,
      contactName: v.data.company,
      contactMobile: v.data.mobile,
      contactVerified: Boolean(session && session.mobile === v.data.mobile),
      source: 'cooperation',
      cooperationType: TRACK_TYPE[v.data.track],
      context: { company: v.data.company, product: v.data.product, message: v.data.message },
      items: [],
    });
    return NextResponse.json({ ok: true, ref }, { status: 201 });
  } catch (err) {
    reportError(err, { route: 'cooperation' });
    return NextResponse.json(
      { error: 'failed', message: 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}

export const POST = withApiErrorHandling(POSTImpl);
