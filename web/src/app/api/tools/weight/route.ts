import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { finiteNumber } from '@/lib/validation/utils';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { unitWeightKg, type WeightShape, type WeightDims } from '@/lib/utils/weight';

const qty = finiteNumber.positive().max(100_000);

/**
 * Either the simple theoretical form or a per-shape spec.
 *
 * This endpoint used to know four shapes while the AI advisor's `calcWeight`
 * tool — which this file's own comment already claimed to share a "single
 * source of truth" with — knew eight, with the arithmetic copy-pasted. The
 * four extra shapes are added here so the claim is finally true; every
 * formula now lives in `lib/utils/weight.ts` and nowhere else.
 */
const payload = z.union([
  z.object({
    theoreticalWeightKg: finiteNumber.positive().max(1_000_000),
    qty,
  }),
  z.object({
    shape: z.literal('rebar'),
    diameterMm: finiteNumber.positive().max(60),
    lengthM: finiteNumber.positive().max(24).default(12),
    qty,
  }),
  z.object({
    shape: z.literal('plate'),
    thicknessMm: finiteNumber.positive().max(200),
    widthM: finiteNumber.positive().max(4),
    lengthM: finiteNumber.positive().max(12),
    qty,
  }),
  z.object({
    shape: z.literal('pipe'),
    outerDiameterMm: finiteNumber.positive().max(1000),
    thicknessMm: finiteNumber.positive().max(60),
    lengthM: finiteNumber.positive().max(24).default(6),
    qty,
  }),
  z.object({
    shape: z.literal('box'),
    widthMm: finiteNumber.positive().max(600),
    heightMm: finiteNumber.positive().max(600),
    thicknessMm: finiteNumber.positive().max(20),
    lengthM: finiteNumber.positive().max(24).default(6),
    qty,
  }),
  /* --- additive: the four shapes the advisor could already answer --- */
  z.object({
    // Round rod sold by coil, so no default length — the caller must say.
    shape: z.literal('wire'),
    diameterMm: finiteNumber.positive().max(60),
    lengthM: finiteNumber.positive().max(200),
    qty,
  }),
  z.object({
    shape: z.literal('angle'),
    legMm: finiteNumber.positive().max(300),
    thicknessMm: finiteNumber.positive().max(200),
    lengthM: finiteNumber.positive().max(24),
    qty,
  }),
  z.object({
    // تسمه — a different section from `angle`; see lib/utils/weight.ts.
    shape: z.literal('flat'),
    widthMm: finiteNumber.positive().max(600),
    thicknessMm: finiteNumber.positive().max(200),
    lengthM: finiteNumber.positive().max(24),
    qty,
  }),
  z.object({
    shape: z.literal('ibeam'),
    sizeCode: finiteNumber.positive().max(60),
    lengthM: finiteNumber.positive().max(24).default(12),
    qty,
  }),
  z.object({
    shape: z.literal('channel'),
    sizeCode: finiteNumber.positive().max(60),
    lengthM: finiteNumber.positive().max(24).default(6),
    qty,
  }),
]);

/** POST /api/tools/weight — وزن‌سنج: theoretical or per-shape formulas.
 *  Also backs the AI's calcWeight tool; both call `lib/utils/weight.ts`, so a
 *  proforma weight cannot depend on which door the customer came through. */
async function POSTImpl(req: NextRequest) {
  const limited = await rateLimit(req, 'tools', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const d = v.data;
  let unit: number | null;
  if ('theoreticalWeightKg' in d) {
    unit = d.theoreticalWeightKg;
  } else {
    const { shape, qty: _qty, ...dims } = d;
    unit = unitWeightKg(shape satisfies WeightShape, dims satisfies WeightDims);
  }
  // null = geometry the formula cannot honestly answer (a pipe whose wall is
  // thicker than its outer diameter — which this endpoint used to answer with
  // a NEGATIVE weight — or a beam size absent from the mill table). Refuse
  // rather than let an invented number reach a پیش‌فاکتور.
  if (unit === null) {
    return NextResponse.json({ error: 'ابعاد واردشده برای این مقطع معتبر نیست.' }, { status: 422 });
  }
  const totalWeightKg = Math.round(unit * d.qty * 100) / 100;
  return NextResponse.json({ unitWeightKg: Math.round(unit * 100) / 100, totalWeightKg });
}

export const POST = withApiErrorHandling(POSTImpl);
