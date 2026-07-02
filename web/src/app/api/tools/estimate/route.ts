import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { estimateItems, estimateProject } from '@/lib/server/services/estimate.service';
import { finiteNumber } from '@/lib/validation/utils';
import { rateLimit } from '@/lib/server/utils/rateLimit';

const payload = z.union([
  z.object({
    items: z
      .array(
        z.object({
          skuId: z.string().min(1),
          qty: finiteNumber.positive().max(100_000),
          unit: z.enum(['kg', 'branch', 'sheet', 'meter']),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    areaM2: finiteNumber.positive().max(100000),
    floors: finiteNumber.int().positive().max(50),
  }),
]);

/** POST /api/tools/estimate — grounded totals (items) or a project estimate
 *  (area×floors → rebar tonnage + cost band). Backs the AI estimateProject tool. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 'tools', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const result =
    'items' in v.data ? await estimateItems(v.data.items) : await estimateProject(v.data.areaM2, v.data.floors);
  return NextResponse.json(result);
}
