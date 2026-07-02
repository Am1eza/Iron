import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { landedCost } from '@/lib/server/services/estimate.service';
import { finiteNumber } from '@/lib/validation/utils';
import { rateLimit } from '@/lib/server/utils/rateLimit';

// goodsToman capped at 1e13 — three orders of magnitude below the JS
// safe-integer ceiling (2^53 ≈ 9e15), comfortably above any real cargo value.
const payload = z.object({
  tons: finiteNumber.positive().max(10000),
  city: z.string().trim().min(1).max(40),
  goodsToman: finiteNumber.positive().max(1e13),
});

/** POST /api/tools/cost — landed-cost breakdown (freight/handling/insurance/
 *  scale/VAT) using the admin-configurable logistics settings. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 'tools', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const result = await landedCost(v.data.tons, v.data.city, v.data.goodsToman);
  return NextResponse.json(result);
}
