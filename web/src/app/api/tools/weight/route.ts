import { NextResponse, type NextRequest } from 'next/server';

/** POST /api/tools/weight — وزن‌سنج (deterministic; markazeahan formulas).
 *  Also backs the AI's calcWeight tool (single source of truth). Stub returns a simple estimate. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const perUnitKg = Number(body?.theoreticalWeightKg);
  const qty = Number(body?.qty);
  if (!Number.isFinite(perUnitKg) || !Number.isFinite(qty) || perUnitKg <= 0 || qty <= 0) {
    return NextResponse.json({ error: 'invalid_input', message: 'ورودی نامعتبر است.' }, { status: 400 });
  }
  // TODO(tools): replace with the full per-shape markazeahan formula set.
  return NextResponse.json({ totalWeightKg: Math.round(perUnitKg * qty * 100) / 100 });
}
