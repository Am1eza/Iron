import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createOrder } from '@/lib/server/repos/ordersRepo';
import { nextRef } from '@/lib/server/utils/refs';

async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb(); if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write'); if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const order = await createOrder({ ref: await nextRef('OR'), leadId: id, items: [], actor: auth.session, requireTerms: true });
  return NextResponse.json({ order, smsQueued: true }, { status: 201 });
}
export const POST = withApiErrorHandling(POSTImpl);
