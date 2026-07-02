import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';

const STEEL_DENSITY = 7.85; // g/cm³

/** Either the simple theoretical form or a per-shape spec. */
const payload = z.union([
  z.object({
    theoreticalWeightKg: z.number().positive(),
    qty: z.number().positive(),
  }),
  z.object({
    shape: z.literal('rebar'),
    diameterMm: z.number().positive().max(60),
    lengthM: z.number().positive().max(24).default(12),
    qty: z.number().positive(),
  }),
  z.object({
    shape: z.literal('plate'),
    thicknessMm: z.number().positive().max(200),
    widthM: z.number().positive().max(4),
    lengthM: z.number().positive().max(12),
    qty: z.number().positive(),
  }),
  z.object({
    shape: z.literal('pipe'),
    outerDiameterMm: z.number().positive().max(1000),
    thicknessMm: z.number().positive().max(60),
    lengthM: z.number().positive().max(24).default(6),
    qty: z.number().positive(),
  }),
  z.object({
    shape: z.literal('box'),
    widthMm: z.number().positive().max(600),
    heightMm: z.number().positive().max(600),
    thicknessMm: z.number().positive().max(20),
    lengthM: z.number().positive().max(24).default(6),
    qty: z.number().positive(),
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
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const unit = unitWeightKg(v.data);
  const totalWeightKg = Math.round(unit * v.data.qty * 100) / 100;
  return NextResponse.json({ unitWeightKg: Math.round(unit * 100) / 100, totalWeightKg });
}
