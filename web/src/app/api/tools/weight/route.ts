import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { finiteNumber } from '@/lib/validation/utils';
import { rateLimit } from '@/lib/server/utils/rateLimit';

const STEEL_DENSITY = 7.85; // g/cm³

const qty = finiteNumber.positive().max(100_000);

/** Either the simple theoretical form or a per-shape spec. */
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
]);

function unitWeightKg(d: z.infer<typeof payload>): number {
  if ('theoreticalWeightKg' in d) return d.theoreticalWeightKg;
  switch (d.shape) {
    case 'rebar':
      // d²/162 kg per metre (the industry formula).
      return ((d.diameterMm * d.diameterMm) / 162) * d.lengthM;
    case 'plate':
      // t(mm) × w(m) × l(m) × 7.85 kg
      return d.thicknessMm * d.widthM * d.lengthM * STEEL_DENSITY;
    case 'pipe':
      // (D − t) × t × 0.02466 kg per metre
      return (d.outerDiameterMm - d.thicknessMm) * d.thicknessMm * 0.02466 * d.lengthM;
    case 'box':
      // perimeter(m) × t(mm) × 7.85 kg per metre
      return (((d.widthMm + d.heightMm) * 2) / 1000) * d.thicknessMm * STEEL_DENSITY * d.lengthM;
  }
}

/** POST /api/tools/weight — وزن‌سنج: theoretical or per-shape formulas.
 *  Also backs the AI's calcWeight tool (single source of truth). */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, 'tools', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const unit = unitWeightKg(v.data);
  const totalWeightKg = Math.round(unit * v.data.qty * 100) / 100;
  return NextResponse.json({ unitWeightKg: Math.round(unit * 100) / 100, totalWeightKg });
}
