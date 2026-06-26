import { NextResponse } from 'next/server';
import { marketValues } from '@/lib/mock/fixtures';

/** GET /api/market — ticker values (tgju FX/gold/ounce + admin billet).
 *  Mock mode returns fixtures; live mode will fetch tgju + the admin billet value. */
export async function GET() {
  // TODO(live): fetch tgju (server-side) + billet from DB; handle outage → last-known + isStale.
  return NextResponse.json({ values: marketValues }, { headers: { 'Cache-Control': 'no-store' } });
}
