import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { findOrderByRef } from '@/lib/server/repos/ordersRepo';

/** GET /api/track/{ref} — public order lookup (the ref is the capability). */
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
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
