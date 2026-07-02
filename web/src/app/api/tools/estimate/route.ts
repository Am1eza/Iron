import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { estimateItems, estimateProject } from '@/lib/server/services/estimate.service';

const payload = z.union([
  z.object({
    items: z
      .array(z.object({ skuId: z.string().min(1), qty: z.number().positive(), unit: z.enum(['kg', 'branch', 'sheet', 'meter']) }))
      .min(1),
  }),
  z.object({
    areaM2: z.number().positive().max(100000),
    floors: z.number().int().positive().max(50),
  }),
]);

/** POST /api/tools/estimate — grounded totals (items) or a project estimate
 *  (area×floors → rebar tonnage + cost band). Backs the AI estimateProject tool. */
export async function POST(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const result =
    'items' in v.data ? await estimateItems(v.data.items) : await estimateProject(v.data.areaM2, v.data.floors);
  return NextResponse.json(result);
}
