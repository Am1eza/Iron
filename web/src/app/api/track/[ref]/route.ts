import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findOrderByRef } from '@/lib/server/repos/ordersRepo';
import { rateLimit } from '@/lib/server/utils/rateLimit';

/** GET /api/track/{ref} — public order lookup (the ref is the capability). */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  // Refs act as capabilities — throttle guessing.
  const limited = rateLimit(req, 'track', { limit: 30 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const { ref } = await ctx.params;
  const order = await findOrderByRef(decodeURIComponent(ref));
  if (!order) {
    return NextResponse.json(
      { error: 'not_found', message: 'سفارشی با این کد رهگیری پیدا نشد.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ order }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
