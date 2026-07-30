import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createWarehouseRequest } from '@/lib/server/services/leads.service';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { finiteNumber } from '@/lib/validation/utils';
import { reportError } from '@/lib/errors/report';

const payload = z.object({
  product: z.string().trim().min(1).max(120),
  quantityTons: finiteNumber.positive().max(100000),
  duration: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/warehouse-requests — «انبار مشتریان» storage ask → real CRM lead
 * (W20). Previously WarehouseForm never called any API at all — see
 * createWarehouseRequest's doc comment for the full "why this exists" story.
 * Authenticated only: the form itself already gates on login (a request
 * needs a real contact to text/call back), so this mirrors that instead of
 * accepting a guest payload.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'warehouse-requests', { limit: 10 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;

  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  try {
    const result = await createWarehouseRequest(v.data, auth.session);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    reportError(err, { route: 'warehouse-requests' });
    return NextResponse.json(
      { error: 'warehouse_request_failed', message: 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}

export const POST = withApiErrorHandling(POSTImpl);
