import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { landedCost } from '@/lib/server/services/estimate.service';

const payload = z.object({
  tons: z.number().positive().max(10000),
  city: z.string().trim().min(1).max(40),
  goodsToman: z.number().positive(),
});

/** POST /api/tools/cost — landed-cost breakdown (freight/handling/insurance/
 *  scale/VAT) using the admin-configurable logistics settings. */
export async function POST(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const result = await landedCost(v.data.tons, v.data.city, v.data.goodsToman);
  return NextResponse.json(result);
}
