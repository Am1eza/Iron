import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createCutToSizeRequest } from '@/lib/server/services/leads.service';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { reportError } from '@/lib/errors/report';

const payload = z.object({
  product: z.string().trim().min(1).max(120),
  currentDimensions: z.string().trim().max(200).optional(),
  requestedDimensions: z.string().trim().min(1).max(200),
  quantity: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/cut-to-size-requests — «کالا با ابعاد درخواستی» (cut-to-size) ask →
 * real CRM lead + a mirrored row in the customer's «درخواست‌های من» inbox.
 * Mirrors /api/warehouse-requests exactly: authenticated only (the form gates
 * on login, and a cutting job needs a real contact to call back), same-origin,
 * rate-limited.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'cut-to-size-requests', { limit: 10 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;

  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  try {
    const result = await createCutToSizeRequest(v.data, auth.session);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    reportError(err, { route: 'cut-to-size-requests' });
    return NextResponse.json(
      { error: 'cut_to_size_request_failed', message: 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}

export const POST = withApiErrorHandling(POSTImpl);
