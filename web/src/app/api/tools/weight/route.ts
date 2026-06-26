import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { weightPayload } from '@/lib/validation/api';

/** POST /api/tools/weight — وزن‌سنج (deterministic; markazeahan formulas).
 *  Also backs the AI's calcWeight tool (single source of truth). Server-validated. */
export async function POST(req: NextRequest) {
  const v = await validateBody(req, weightPayload);
  if (!v.ok) return v.response;
  const { theoreticalWeightKg, qty } = v.data;
  // TODO(tools): replace with the full per-shape markazeahan formula set.
  return NextResponse.json({ totalWeightKg: Math.round(theoreticalWeightKg * qty * 100) / 100 });
}
